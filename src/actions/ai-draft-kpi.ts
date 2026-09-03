"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KpiLevel } from "@/lib/kpi-levels";

const TacticSchema = z.string();
const StrategySchema = z.object({ text: z.string(), tactics: z.array(TacticSchema) });
const ObjectiveSchema = z.object({ text: z.string(), strategies: z.array(StrategySchema) });
const GoalSchema = z.object({ text: z.string(), objectives: z.array(ObjectiveSchema) });
const KpiTreeResponseSchema = z.object({ goals: z.array(GoalSchema) });

type SourceDocumentRow = { id: string; file_name: string; storage_path: string };

async function generateKpiDraftInternal(projectId: string, tenantId: string) {
  const supabase = await createServerActionClient();

  const { data: documentsData, error: docError } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify(["KPI"]));
  if (docError) throw docError;
  const documents = documentsData as unknown as SourceDocumentRow[];
  if (!documents || documents.length === 0) {
    throw new UserFacingError("「KPI」に分類された資料がありません。先に資料をアップロード・分類してください。");
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

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_kpi_tree");
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
  const parsed = KpiTreeResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { chapter_no: 4, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new UserFacingError("AIの出力形式が不正でした。");

  // 再生成＝作り直しの意図。se_reviewing・confirmed等の人が触れた項目は対象外
  const { error: deleteDraftError } = await supabase
    .from("requirement_items")
    .delete()
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .eq("status", "ai_draft");
  if (deleteDraftError) throw deleteDraftError;

  for (const goal of parsed.data.goals) {
    const goalId = await insertKpiNode(supabase, projectId, tenantId, null, "ゴール", goal.text);
    for (const objective of goal.objectives) {
      const objectiveId = await insertKpiNode(supabase, projectId, tenantId, goalId, "目標", objective.text);
      for (const strategy of objective.strategies) {
        const strategyId = await insertKpiNode(supabase, projectId, tenantId, objectiveId, "戦略", strategy.text);
        for (const tactic of strategy.tactics) {
          await insertKpiNode(supabase, projectId, tenantId, strategyId, "戦術", tactic);
        }
      }
    }
  }

  revalidatePath(`/projects/${projectId}/chapters/4`);
}

async function insertKpiNode(
  supabase: SupabaseClient,
  projectId: string,
  tenantId: string,
  parentId: string | null,
  level: KpiLevel,
  text: string
): Promise<string> {
  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 4,
      template_type: "D",
      parent_id: parentId,
      content: { level, text },
      status: "ai_draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

// generateDraft（Flow1）等と同じuseActionState対応パターン（規約50）。
// throw+error.tsxだと具体的なエラー文言が汎用文言に潰れる（ai-draft.ts参照）ため、
// 戻り値のerrorで判定する形に統一する。
export async function generateKpiDraft(
  projectId: string,
  tenantId: string,
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    await generateKpiDraftInternal(projectId, tenantId);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
