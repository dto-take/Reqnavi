"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ChecklistContent } from "@/actions/nonfunctional-checklist";

const CategorySchema = z.object({
  category: z.string(),
  overview: z.string(),
  checklist: z.array(z.object({ item: z.string() })),
});
const NonFunctionalResponseSchema = z.object({ categories: z.array(CategorySchema) });

type SourceDocumentRow = { id: string; file_name: string; storage_path: string };

async function generateNonFunctionalDraftInternal(projectId: string, tenantId: string) {
  const supabase = await createServerActionClient();

  const { data: documentsData, error: docError } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify(["非機能要件"]));
  if (docError) throw docError;
  const documents = documentsData as unknown as SourceDocumentRow[];
  if (!documents || documents.length === 0) {
    throw new UserFacingError("「非機能要件」に分類された資料がありません。先に資料をアップロード・分類してください。");
  }

  const excerpts = await Promise.all(
    documents.map(async (d) => {
      const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
      if (!file) return `[取得不可: ${d.file_name}]`;
      const extracted = await extractContent(file, d.file_name);
      return extracted.kind === "text"
        ? `--- ${d.file_name} ---\n${extracted.content.slice(0, 3000)}`
        : `[テキスト抽出不可: ${d.file_name}]`;
    })
  );

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_nonfunctional_checklist");
  const filledPrompt = promptBody.replace("{document_excerpts}", excerpts.join("\n\n"));

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: filledPrompt,
      config: { responseMimeType: "application/json" },
    })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = NonFunctionalResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { chapter_no: 10, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new UserFacingError("AIの出力形式が不正でした。");

  const { error: deleteDraftError } = await supabase
    .from("requirement_items")
    .delete()
    .eq("project_id", projectId)
    .eq("chapter_no", 10)
    .eq("status", "ai_draft");
  if (deleteDraftError) throw deleteDraftError;

  const rows = parsed.data.categories.map((c) => ({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 10,
    template_type: "E",
    content: {
      category: c.category,
      overview: c.overview,
      checklist: c.checklist.map((item) => ({ item: item.item, status: "未" as const })),
    } satisfies ChecklistContent,
    status: "ai_draft",
  }));
  const { error: insertError } = await supabase.from("requirement_items").insert(rows);
  if (insertError) throw insertError;

  revalidatePath(`/projects/${projectId}/chapters/10`);
}

// generateDraft（Flow1）等と同じuseActionState対応パターン（規約50）。
export async function generateNonFunctionalDraft(
  projectId: string,
  tenantId: string,
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    await generateNonFunctionalDraftInternal(projectId, tenantId);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
