"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { scanContentForAmbiguousPhrases, type AmbiguousFlag } from "@/lib/ambiguous-phrases";
import { getActivePrompt } from "@/lib/ai/prompts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { errorMessage } from "@/lib/error-message";

type ItemRow = { id: string; content: Record<string, string | null>; ambiguous_flags: AmbiguousFlag[] | null };

export async function runAmbiguousCheck(projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: itemsData, error } = await supabase
    .from("requirement_items")
    .select("id, content, ambiguous_flags")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;

  const items = itemsData as unknown as ItemRow[];
  for (const item of items) {
    const dictionaryFlags = scanContentForAmbiguousPhrases(item.content);
    const existingOtherFlags = (item.ambiguous_flags ?? []).filter(
      (f: AmbiguousFlag) => f.source !== "dictionary"
    );
    const nextFlags = [...existingOtherFlags, ...dictionaryFlags];

    const { error: updateError } = await supabase
      .from("requirement_items")
      .update({ ambiguous_flags: nextFlags })
      .eq("id", item.id);
    if (updateError) throw updateError;
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

const AiAmbiguitySchema = z.object({
  ambiguous: z.boolean(),
  field: z.string().nullable(),
  reason: z.string().nullable(),
});

const AI_AMBIGUITY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ambiguous: { type: "boolean" },
    field: { type: ["string", "null"] },
    reason: { type: ["string", "null"] },
  },
  required: ["ambiguous", "field", "reason"],
};

async function runAmbiguousCheckAIInternal(projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: itemsData, error } = await supabase
    .from("requirement_items")
    .select("id, content, ambiguous_flags")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;

  const items = itemsData as unknown as ItemRow[];
  const { id: promptId, body: promptBody } = await getActivePrompt("ambiguity_check_l2");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  for (const item of items) {
    const filledPrompt = promptBody.replace("{item_content}", JSON.stringify(item.content));
    const response = await callGeminiSafely(() =>
      ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: filledPrompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: AI_AMBIGUITY_RESPONSE_SCHEMA,
        },
      })
    );

    const parsed = AiAmbiguitySchema.safeParse(JSON.parse(response.text ?? "{}"));
    await supabase.from("ai_interactions").insert({
      project_id: projectId,
      prompt_id: promptId,
      input_summary: { item_id: item.id },
      output: parsed.success ? parsed.data : { error: "validation_failed" },
    });
    if (!parsed.success || !parsed.data.ambiguous) continue;

    const existingOtherFlags = (item.ambiguous_flags ?? []).filter(
      (f: AmbiguousFlag) => f.source !== "ai"
    );
    const nextFlags: AmbiguousFlag[] = [
      ...existingOtherFlags,
      { source: "ai", field: parsed.data.field ?? "", reason: parsed.data.reason ?? undefined, matched_text: "" },
    ];

    await supabase.from("requirement_items").update({ ambiguous_flags: nextFlags }).eq("id", item.id);
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

// generateDraft同様、Gemini呼び出しのエラー（AiCallError）はthrowせず戻り値で返す
// （error.tsxがServer Action由来のメッセージを表示できないため。ai-draft.ts参照）。
export async function runAmbiguousCheckAI(
  projectId: string,
  chapterNo: number,
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    await runAmbiguousCheckAIInternal(projectId, chapterNo);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
