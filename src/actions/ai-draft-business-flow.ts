"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { regenerateEdges, type FlowType } from "@/actions/business-flow";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const StepSchema = z.object({
  role_lane: z.string(),
  label: z.string(),
  system_used: z.string().nullable(),
});
const FlowResponseSchema = z.object({ steps: z.array(StepSchema) });

const DOCUMENT_TAG_BY_FLOW_TYPE: Record<FlowType, string> = {
  business_asis: "業務要件",
  business_tobe: "機能要件",
};

type SourceDocumentRow = { id: string; file_name: string; storage_path: string };

async function generateBusinessFlowDraftInternal(projectId: string, flowType: FlowType) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  // flow_nodesにはstatus列が無く自由に編集できるため、既存のai_draftのみ削除して
  // 再生成という安全策が使えない。初期構築時（0件時）のみAI生成を許可する。
  const { count: existingCount } = await supabase
    .from("flow_nodes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("flow_type", flowType);
  if ((existingCount ?? 0) > 0) {
    throw new UserFacingError(
      "既にステップが登録されているため、AI生成は実行できません（初期構築時のみ利用可能です）。既存のステップを全て削除してから再実行してください。"
    );
  }

  const tag = DOCUMENT_TAG_BY_FLOW_TYPE[flowType];
  const { data: documentsData, error: docError } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify([tag]));
  if (docError) throw docError;
  const documents = documentsData as unknown as SourceDocumentRow[];
  if (!documents || documents.length === 0) {
    throw new UserFacingError(`「${tag}」に分類された資料がありません。先に資料をアップロード・分類してください。`);
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

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_business_flow");
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
  const parsed = FlowResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { flow_type: flowType, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new UserFacingError("AIの出力形式が不正でした。");

  const rows = parsed.data.steps.map((step, index) => ({
    project_id: projectId,
    tenant_id: tenantId,
    flow_type: flowType,
    label: step.label,
    role_lane: step.role_lane,
    system_used: step.system_used,
    order_index: index,
  }));
  const { error: insertError } = await supabase.from("flow_nodes").insert(rows);
  if (insertError) throw insertError;

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}

// generateDraft・generateKpiDraft等と同じuseActionState対応パターン（規約50）。
// throw+error.tsxだと具体的なエラー文言が汎用文言に潰れるため、戻り値のerrorで判定する。
export async function generateBusinessFlowDraft(
  projectId: string,
  flowType: FlowType,
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    await generateBusinessFlowDraftInternal(projectId, flowType);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
