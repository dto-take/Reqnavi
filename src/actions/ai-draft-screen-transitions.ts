"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const TransitionSchema = z.object({ from: z.string(), to: z.string(), label: z.string().nullable() });
const TransitionResponseSchema = z.object({ transitions: z.array(TransitionSchema) });

type SourceDocumentRow = { id: string; file_name: string; storage_path: string };
type ScreenItemRow = { content: Record<string, string> };

async function generateScreenTransitionDraftInternal(projectId: string) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  // flow_nodesにはstatus列が無く自由に編集できるため、既存のai_draftのみ削除して
  // 再生成という安全策が使えない。初期構築時（0件時）のみAI生成を許可する
  // （src/actions/ai-draft-business-flow.tsと同じ設計判断）。
  const { count: existingCount } = await supabase
    .from("flow_nodes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition");
  if ((existingCount ?? 0) > 0) {
    throw new UserFacingError(
      "既に画面が登録されているため、AI生成は実行できません（初期構築時のみ利用可能です）。既存の画面を全て削除してから再実行してください。"
    );
  }

  const { data: itemsData } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", 9);
  const items = (itemsData as unknown as ScreenItemRow[] | null) ?? [];
  const screenNames = items
    .filter((i) => (i.content.screen_fields ?? "").trim() !== "")
    .map((i) => i.content.name)
    .filter((name): name is string => !!name);

  if (screenNames.length === 0) {
    throw new UserFacingError("画面情報が入力された機能要件がありません。先に9章で画面パターン・表示項目を入力してください。");
  }

  const { data: documentsData } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify(["機能要件"]));
  const documents = (documentsData as unknown as SourceDocumentRow[] | null) ?? [];

  const excerpts = await Promise.all(
    documents.map(async (d) => {
      const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
      if (!file) return `[取得不可: ${d.file_name}]`;
      const extracted = await extractContent(file, d.file_name);
      return extracted.kind === "text" ? `--- ${d.file_name} ---\n${extracted.content.slice(0, 3000)}` : `[テキスト抽出不可: ${d.file_name}]`;
    })
  );

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_screen_transitions");
  const filledPrompt = promptBody
    .replace("{screen_names}", screenNames.join(", "))
    .replace("{document_excerpts}", excerpts.join("\n\n") || "（参考資料なし。画面名から一般的な遷移を推測してください）");

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
  const parsed = TransitionResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { flow_type: "screen_transition", screen_count: screenNames.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new UserFacingError("AIの出力形式が不正でした。");

  const nodeIdByName = new Map<string, string>();
  for (let i = 0; i < screenNames.length; i++) {
    const { data, error } = await supabase
      .from("flow_nodes")
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        flow_type: "screen_transition",
        label: screenNames[i],
        order_index: i,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("画面ノードの作成に失敗しました");
    nodeIdByName.set(screenNames[i], data.id);
  }

  // AIが画面名一覧に無いfrom/toを提案した場合は新規ノードを作らずスキップする
  // （指示書の「やってはいけないこと」）。
  const edgeRows = parsed.data.transitions
    .filter((t) => nodeIdByName.has(t.from) && nodeIdByName.has(t.to))
    .map((t) => ({
      from_node: nodeIdByName.get(t.from)!,
      to_node: nodeIdByName.get(t.to)!,
      label: t.label,
    }));
  if (edgeRows.length > 0) {
    const { error: edgeError } = await supabase.from("flow_edges").insert(edgeRows);
    if (edgeError) throw edgeError;
  }

  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}

// generateBusinessFlowDraft等と同じuseActionState対応パターン（規約50）。
// throw+error.tsxだと具体的なエラー文言が汎用文言に潰れるため、戻り値のerrorで判定する。
export async function generateScreenTransitionDraft(
  projectId: string,
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    await generateScreenTransitionDraftInternal(projectId);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
