"use server";

import { UserFacingError } from "@/lib/user-error";
import { safeFormAction, type FormActionState } from "@/lib/action-result";
import { createServerActionClient } from "@/lib/supabase/server";
import { scanContentForAmbiguousPhrases, type AmbiguousFlag } from "@/lib/ambiguous-phrases";
import { getActivePrompt } from "@/lib/ai/prompts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { errorMessage } from "@/lib/error-message";
import { fetchAllPages } from "@/lib/paged-select";

type ItemRow = { id: string; content: Record<string, string | null>; ambiguous_flags: AmbiguousFlag[] | null };

// useActionStateの形（失敗は戻り値のerrorでフォーム内に表示する。本番ビルドではthrowの文言が消えるため）
export async function runAmbiguousCheck(projectId: string, chapterNo: number, _prevState: FormActionState, _formData: FormData): Promise<FormActionState> {
  return safeFormAction("runAmbiguousCheck", () => runAmbiguousCheckInner(projectId, chapterNo));
}

async function runAmbiguousCheckInner(projectId: string, chapterNo: number): Promise<void> {
  const supabase = await createServerActionClient();
  const items = await fetchAllPages<ItemRow>((from, to) =>
    supabase
      .from("requirement_items")
      .select("id, content, ambiguous_flags")
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo)
      .order("id")
      .range(from, to)
  );
  for (const item of items) {
    const dictionaryFlags = scanContentForAmbiguousPhrases(item.content);
    const existingOtherFlags = (item.ambiguous_flags ?? []).filter(
      (f: AmbiguousFlag) => f.source !== "dictionary"
    );
    const nextFlags = [...existingOtherFlags, ...dictionaryFlags];

    const { data: affected1, error: updateError } = await supabase
      .from("requirement_items")
      .update({ ambiguous_flags: nextFlags })
      .eq("id", item.id).select("id");
    if (updateError) throw updateError;
    if (!affected1 || affected1.length === 0) throw new UserFacingError("対象が見つかりません");
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

const AiAmbiguitySchema = z.object({
  ambiguous: z.boolean(),
  field: z.string().nullable(),
  reason: z.string().nullable(),
  phrase: z.string().nullable(),
});

const AI_AMBIGUITY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ambiguous: { type: "boolean" },
    field: { type: ["string", "null"] },
    reason: { type: ["string", "null"] },
    phrase: { type: ["string", "null"] },
  },
  required: ["ambiguous", "field", "reason", "phrase"],
};

async function runAmbiguousCheckAIInternal(projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const items = await fetchAllPages<ItemRow>((from, to) =>
    supabase
      .from("requirement_items")
      .select("id, content, ambiguous_flags")
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo)
      .order("id")
      .range(from, to)
  );
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
      {
        source: "ai",
        field: parsed.data.field ?? "",
        reason: parsed.data.reason ?? undefined,
        phrase: parsed.data.phrase ?? undefined,
      },
    ];

    const { data: updated, error: updateError } = await supabase
      .from("requirement_items")
      .update({ ambiguous_flags: nextFlags })
      .eq("id", item.id)
      .select("id");
    if (updateError) throw new UserFacingError(errorMessage(updateError));
    if (!updated || updated.length === 0) throw new UserFacingError("対象が見つかりません"); // 規約47
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
