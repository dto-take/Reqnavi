"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { DOCUMENT_EXCERPT_MAX_LENGTH } from "@/lib/ai/excerpt-limit";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { gridPosition, hasScreenInfo } from "@/lib/screen-flow/derive";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const TransitionSchema = z.object({ from: z.string(), to: z.string(), label: z.string().nullable() });
const TransitionResponseSchema = z.object({ transitions: z.array(TransitionSchema) });

type SourceDocumentRow = { id: string; file_name: string; storage_path: string };
type ScreenItemRow = { id: string; content: Record<string, string>; status: string };

async function generateScreenTransitionDraftInternal(projectId: string) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  // 図は人が自由に編集する（座標・紐付け・遷移）ため、既存のai_draftのみ削除して
  // 再生成という安全策が使えない。フェーズ3で差分提案に置き換えるまでは、初期構築時（0件時）のみAI生成を許可する
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

  // 画面遷移図UX改善フェーズ1：作成するノードに9章項目（function_item_id）を紐付けるため、
  // idも取得する。rejected（不採用）の項目は図の対象から除く（「9章にあって図にない画面」と同じ条件）。
  const { data: itemsData } = await supabase
    .from("requirement_items")
    .select("id, content, status")
    .eq("project_id", projectId)
    .eq("chapter_no", 9)
    .order("order_index")
    .order("created_at");
  const items = (itemsData as unknown as ScreenItemRow[] | null) ?? [];
  const screenItems = items.filter((i) => hasScreenInfo(i.content) && i.status !== "rejected" && !!i.content.name);
  const screenNames = screenItems.map((i) => i.content.name);

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
      return extracted.kind === "text" ? `--- ${d.file_name} ---\n${extracted.content.slice(0, DOCUMENT_EXCERPT_MAX_LENGTH)}` : `[テキスト抽出不可: ${d.file_name}]`;
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

  // 同名の9章項目が複数ある場合は名前から遷移先を特定できないため、最初の1件のみを
  // 遷移の対象とする（ノード自体は項目ごとに作成し、全て紐付ける）。
  const nodeIdByName = new Map<string, string>();
  for (let i = 0; i < screenItems.length; i++) {
    const pos = gridPosition(i);
    const { data, error } = await supabase
      .from("flow_nodes")
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        flow_type: "screen_transition",
        label: screenItems[i].content.name,
        order_index: i,
        screen_code: `S-${String(i + 1).padStart(2, "0")}`,
        pos_x: pos.x,
        pos_y: pos.y,
        function_item_id: screenItems[i].id,
        status: "ai_draft",
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("画面ノードの作成に失敗しました");
    if (!nodeIdByName.has(screenItems[i].content.name)) nodeIdByName.set(screenItems[i].content.name, data.id);
  }

  // AIが画面名一覧に無いfrom/toを提案した場合は新規ノードを作らずスキップする
  // （指示書の「やってはいけないこと」）。
  // 同一の遷移・自己ループはDB制約（flow_edges_from_to_unique・flow_edges_no_self_loop）で
  // 弾かれるため、挿入前に取り除く。
  const seenPairs = new Set<string>();
  const edgeRows = parsed.data.transitions
    .filter((t) => nodeIdByName.has(t.from) && nodeIdByName.has(t.to) && t.from !== t.to)
    .map((t) => ({
      from_node: nodeIdByName.get(t.from)!,
      to_node: nodeIdByName.get(t.to)!,
      label: t.label,
    }))
    .filter((e) => {
      const key = `${e.from_node}>${e.to_node}`;
      if (seenPairs.has(key)) return false;
      seenPairs.add(key);
      return true;
    });
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
