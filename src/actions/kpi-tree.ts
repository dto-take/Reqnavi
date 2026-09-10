"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { isItemLocked } from "@/lib/item-lock";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KPI_LEVELS, type KpiLevel } from "@/lib/kpi-levels";

// フェーズ3：AI候補生成は「選択ノードの1つ下の階層」を提案する（戦術の次は測定指標）。
// KPI_LEVELS（ゴール/目標/戦略/戦術）に測定指標を加えた順序として別に持つ
// （測定指標はrequirement_itemsの独立した階層ノードではなくcontent.metricフィールドの
// 値でしかないため、KPI_LEVELS/KpiLevel型そのものには含めない）。
const LEVEL_ORDER = ["ゴール", "目標", "戦略", "戦術", "測定指標"];

// "use server"ファイルは非同期関数以外をexportできない。KPI_LEVELS（実行時の配列値）は
// src/lib/kpi-levels.tsへ切り出し済み。KpiLevel型はexport type {}での再exportすら
// Next.jsのServer Actionsマニフェスト生成でエラーになるため、ここではimportのみに留め、
// 利用側（KpiTree.tsx等）には@/lib/kpi-levelsから直接importしてもらう。

// kpi_ux_phase1.md Step1：本文（text）以外に測定指標・担当・期限も持たせる。
// jsonb列のためスキーマ変更は不要。既存のAI一括生成（ai-draft-kpi.ts）はtext/levelのみを
// 書き込む現状のままでよい（指示書の指定通り）。
export type KpiNodeContent = {
  level: KpiLevel;
  text: string;
  metric?: string;
  owner?: string;
  due_date?: string;
};

export type KpiNode = {
  id: string;
  parent_id: string | null;
  content: KpiNodeContent;
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved";
};

export async function listKpiTree(projectId: string): Promise<KpiNode[]> {
  const supabase = await createServerActionClient();
  // order_indexのみのORDER BYは同点（フェーズ1〜3まではKPIノードの新規作成時に
  // order_indexを一切設定しておらずデフォルト値0のまま）の場合に表示順が不定になる
  // （規約42）。created_atを第二キーにして安定させる。
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, parent_id, content, status")
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .eq("template_type", "D")
    .order("order_index")
    .order("created_at");
  if (error) throw error;
  return data as unknown as KpiNode[];
}

// フェーズ4：兄弟ノード（同じparent_id）をorder_index順（同点はcreated_at順）で取得する。
// parentIdがnullの場合（ゴール階層）はproject全体の中でparent_idがnullの行を対象にする。
type OrderedSupabase = Awaited<ReturnType<typeof createServerActionClient>>;

async function fetchOrderedSiblingIds(
  supabase: OrderedSupabase,
  projectId: string,
  parentId: string | null
): Promise<string[]> {
  let query = supabase
    .from("requirement_items")
    .select("id")
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .eq("template_type", "D")
    .order("order_index")
    .order("created_at");
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data, error } = await query;
  if (error) throw new UserFacingError(errorMessage(error));
  return (data ?? []).map((s) => (s as { id: string }).id);
}

// 兄弟グループ全体のorder_indexを渡された配列順に0から振り直す（requirement-items.tsの
// applyOrderと同じ「並び替えは章全体を一旦フラットに取得してから並べ直す」考え方）。
// 個別に値をswapするのではなく毎回0..n-1に振り直すことで、フェーズ1〜3までorder_indexが
// 一度も設定されておらずすべて0のままだった既存データに対しても正しく機能する。
async function applySiblingOrder(supabase: OrderedSupabase, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("requirement_items").update({ order_index: i }).eq("id", orderedIds[i]);
    if (error) throw new UserFacingError(errorMessage(error));
  }
}

// idを返すのは、追加直後に新しいノードを選択状態にするため（旧・単一ツリー表示では
// 追加直後の空欄がその場に見えていたのに対し、2ペイン化で追加先が別ペインの
// ツリー内に埋もれてしまうと使い勝手が退行するため。既存機能の移植として実装）。
// フェーズ3：AI候補採用（adoptKpiCandidate）でも、候補文言・ai_draftステータスで
// このまま流用できるよう、text・statusを省略可能な引数として追加した（デフォルト値は
// 既存の手動追加の挙動＝空文字・se_reviewingのままなので、フェーズ1/2からの既存呼び出しは
// 一切変更不要）。
export async function createKpiNode(
  projectId: string,
  tenantId: string,
  parentId: string | null,
  level: KpiLevel,
  text: string = "",
  status: "ai_draft" | "se_reviewing" = "se_reviewing"
): Promise<string> {
  const supabase = await createServerActionClient();
  // フェーズ4：兄弟の末尾に追加されるよう、既存の兄弟数をそのまま次のorder_indexとして使う
  // （applySiblingOrderで常に0..n-1に振り直す運用のため、件数がそのまま次の空き番号になる）。
  const orderIndex = (await fetchOrderedSiblingIds(supabase, projectId, parentId)).length;
  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 4,
      template_type: "D",
      parent_id: parentId,
      content: { level, text },
      status,
      order_index: orderIndex,
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "作成に失敗しました");
  revalidatePath(`/projects/${projectId}/chapters/4`);
  return (data as unknown as { id: string }).id;
}

// フェーズ1：本文（text）・測定指標（metric）・担当（owner）・期限（due_date）を
// 同じロジックで更新できるよう一本化する（旧updateKpiNodeTextはこれに統合し廃止。
// 呼び出し箇所がKpiTree.tsx内の1箇所のみだったことをgrepで確認済み）。
// フェーズ2：確定済み（isItemLocked）の項目は編集自体を拒否する。また、AI素案（ai_draft）を
// 人が編集した場合は要レビュー（se_reviewing）へ自動的に引き上げる（新しいステータス列は
// 追加せず、既存のrequirement_items.statusをそのまま使う。指示書の重要な設計判断）。
export async function updateKpiNodeField(
  nodeId: string,
  projectId: string,
  field: "text" | "metric" | "owner" | "due_date",
  value: string
) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("content, status")
    .eq("id", nodeId)
    .single();
  if (fetchError || !current) throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");

  if (isItemLocked(current.status)) {
    throw new UserFacingError("確定済みの項目は編集できません");
  }

  const newContent = { ...(current.content as KpiNodeContent), [field]: value };
  const newStatus = current.status === "ai_draft" ? "se_reviewing" : current.status;

  const { error } = await supabase
    .from("requirement_items")
    .update({ content: newContent, status: newStatus })
    .eq("id", nodeId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/4`);
}

// フェーズ2：確定して次へ（Step3）。confirmed自体はロック済みステータスの1つなので、
// 呼び出し側（KpiDetailPane）でisItemLocked(selectedNode.status)により既に確定済みの
// ノードにはボタン自体を表示しない設計にする。
export async function confirmKpiNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "confirmed" })
    .eq("id", nodeId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/4`);
}

// フェーズ3：選択中ノードの「1つ下の階層」の候補を根拠付きでAIに提案させる。
// 候補はDBに永続化せず（新しいテーブルは作らない、との指示書の方針）、呼び出し元の
// KpiDetailPane側でReactのuseStateとして一時的に保持するだけにする。
// 「見送り」も画面上でリストから消すのみでDBには何も記録しない。
export async function suggestKpiCandidates(
  nodeId: string,
  projectId: string,
  excludeTexts: string[]
): Promise<{ text: string; why: string }[]> {
  const supabase = await createServerActionClient();

  const { data: node, error: nodeError } = await supabase
    .from("requirement_items")
    .select("content, parent_id")
    .eq("id", nodeId)
    .single();
  if (nodeError || !node) throw new UserFacingError(nodeError ? errorMessage(nodeError) : "項目が見つかりません");

  const currentLevel = (node.content as KpiNodeContent).level;
  const targetLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevel) + 1] ?? "測定指標";

  const ancestorChain: string[] = [];
  let parentId = node.parent_id;
  while (parentId) {
    const { data: parent } = await supabase
      .from("requirement_items")
      .select("content, parent_id")
      .eq("id", parentId)
      .single();
    if (!parent) break;
    ancestorChain.unshift((parent.content as KpiNodeContent).text);
    parentId = parent.parent_id;
  }

  const { data: siblings } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .neq("id", nodeId);
  const siblingTexts = (siblings ?? [])
    .filter((s) => (s.content as KpiNodeContent).level === currentLevel)
    .map((s) => (s.content as KpiNodeContent).text);

  // 他章の確定済み内容を参考文脈として渡す。本文列の優先順位はfix_card_body_field.mdの
  // pickBodyColumnKeyと同じ考え方（内容のある列を優先）に揃える。nameは見出し用の列であり
  // fix_card_title_body_order.md以降は本文候補から除外しているため、ここでも含めない。
  const { data: otherChapterItems } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("status", "confirmed")
    .neq("chapter_no", 4)
    .limit(10);
  const otherChapterContext = (otherChapterItems ?? [])
    .map((i) => {
      const c = i.content as Record<string, string>;
      return c.detail ?? c.issue ?? c.why ?? "";
    })
    .filter(Boolean)
    .join("\n");

  const { id: promptId, body: promptBody } = await getActivePrompt("suggest_kpi_children");
  const filledPrompt = promptBody
    .replace("{current_level}", currentLevel)
    .replace("{current_text}", (node.content as KpiNodeContent).text)
    .replace("{ancestor_chain}", ancestorChain.join(" > "))
    .replace("{sibling_texts}", siblingTexts.join("\n"))
    .replace("{other_chapter_context}", otherChapterContext || "（特になし）")
    .replace("{exclude_texts}", excludeTexts.join("\n") || "（なし）")
    .replace("{target_level}", targetLevel);

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({ model: "gemini-3.6-flash", contents: filledPrompt })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = z
    .object({ candidates: z.array(z.object({ text: z.string(), why: z.string() })) })
    .safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { node_id: nodeId, target_level: targetLevel },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new UserFacingError("AIの出力形式が不正でした。");
  return parsed.data.candidates;
}

// フェーズ3：候補の採用。戦術ノードの場合は「1つ下の階層」が存在しない代わりに、
// そのノード自身のmetric（測定指標）フィールドに書き込む（指示書のInteractions仕様通り）。
// それ以外の階層では、選択ノードの子としてai_draftステータスのノードを作成する
// （既存の「AI素案」バッジがそのまま機能するようにするため。指示書の注意書き通り）。
export async function adoptKpiCandidate(
  nodeId: string,
  projectId: string,
  tenantId: string,
  candidateText: string
): Promise<string | null> {
  const supabase = await createServerActionClient();
  const { data: node, error: nodeError } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("id", nodeId)
    .single();
  if (nodeError || !node) throw new UserFacingError(nodeError ? errorMessage(nodeError) : "項目が見つかりません");

  const currentLevel = (node.content as KpiNodeContent).level;

  if (currentLevel === "戦術") {
    await updateKpiNodeField(nodeId, projectId, "metric", candidateText);
    return null;
  }

  const targetLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevel) + 1] as KpiLevel;
  const newNodeId = await createKpiNode(projectId, tenantId, nodeId, targetLevel, candidateText, "ai_draft");
  return newNodeId;
}

// フェーズ4：兄弟ノード内での並べ替え（上へ/下へ移動）。範囲外（先頭で上へ／末尾で下へ）は
// 何もしない。確定済みノードは並べ替え不可（規約：確定済みへの操作経路を残さない）。
export async function moveKpiNodeUpDown(nodeId: string, projectId: string, direction: "up" | "down") {
  const supabase = await createServerActionClient();
  const { data: node, error: nodeError } = await supabase
    .from("requirement_items")
    .select("parent_id, status")
    .eq("id", nodeId)
    .single();
  if (nodeError || !node) throw new UserFacingError(nodeError ? errorMessage(nodeError) : "項目が見つかりません");
  if (isItemLocked(node.status)) throw new UserFacingError("確定済みの項目は並び替えできません");

  const ids = await fetchOrderedSiblingIds(supabase, projectId, node.parent_id);
  const idx = ids.indexOf(nodeId);
  if (idx === -1) return;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= ids.length) return; // 範囲外は何もしない（指示書の指定通り）

  const reordered = [...ids];
  [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
  await applySiblingOrder(supabase, reordered);
  revalidatePath(`/projects/${projectId}/chapters/4`);
}

// requirement_itemsの1行分（親を辿る/子孫を集める処理で使う最小限の列）
type KpiRow = { id: string; parent_id: string | null; content: KpiNodeContent; status: string };

// 対象ノード配下の子孫を再帰的に集める（changeKpiNodeLevelで配下全ノードのlevelを
// 一括再計算するために使う。KPIツリーは実運用上ゴール→目標→戦略→戦術の最大4階層だが、
// 汎用的に再帰で辿る）。
async function collectDescendants(supabase: OrderedSupabase, nodeId: string): Promise<KpiRow[]> {
  const { data: children, error } = await supabase
    .from("requirement_items")
    .select("id, parent_id, content, status")
    .eq("parent_id", nodeId);
  if (error) throw new UserFacingError(errorMessage(error));
  const result: KpiRow[] = [];
  for (const child of (children ?? []) as KpiRow[]) {
    result.push(child);
    result.push(...(await collectDescendants(supabase, child.id)));
  }
  return result;
}

// フェーズ4：階層変更（1段上げる/下げる）。最も複雑な処理のため、実データ（3階層以上）で
// 「戦略を1段上げる」等を行い、配下（戦術）のlevelも正しく追従するか必ず確認すること
// （指示書の注意書き）。
//
// promote（1段上げる）：新しい親＝今の親の親（祖父母）。ただし今の親がゴール（parent_idが
// null）の場合は、結果としてparent_idがnullの新しいルートノードができてしまい、
// 「ゴールは章に1件」というフェーズ1以来のデータモデル前提が壊れるため、境界チェックとして
// 拒否する（指示書の「ゴール階層より浅くする操作を無視する」の実務上の解釈）。
//
// demote（1段下げる）：新しい親＝直前の兄弟ノード。直前の兄弟が無い（既に先頭）場合は
// 何もしない。
//
// いずれの場合も対象ノードと配下すべてのcontent.levelを深さのズレ分だけシフトするが、
// 配下のどれか1つでもKPI_LEVELSの範囲（ゴール〜戦術）を外れる場合は、一部だけ適用される
// 中途半端な状態を避けるため、書き込み前に全件を検証してから一括で適用する。
export async function changeKpiNodeLevel(nodeId: string, projectId: string, direction: "promote" | "demote") {
  const supabase = await createServerActionClient();
  const { data: node, error: nodeError } = await supabase
    .from("requirement_items")
    .select("parent_id, content, status")
    .eq("id", nodeId)
    .single();
  if (nodeError || !node) throw new UserFacingError(nodeError ? errorMessage(nodeError) : "項目が見つかりません");
  if (isItemLocked(node.status)) throw new UserFacingError("確定済みの項目は階層変更できません");

  const nodeContent = node.content as KpiNodeContent;
  const delta = direction === "promote" ? -1 : 1;

  let newParentId: string | null;

  if (direction === "promote") {
    if (!node.parent_id) return; // 既にゴール階層。境界チェックで無視する
    const { data: parent, error: parentError } = await supabase
      .from("requirement_items")
      .select("parent_id")
      .eq("id", node.parent_id)
      .single();
    if (parentError || !parent) throw new UserFacingError(parentError ? errorMessage(parentError) : "項目が見つかりません");
    newParentId = parent.parent_id;
    if (!newParentId) {
      throw new UserFacingError("これ以上、階層を上げられません（ゴールは案件内に1件のみのため）。");
    }
  } else {
    const siblingIds = await fetchOrderedSiblingIds(supabase, projectId, node.parent_id);
    const idx = siblingIds.indexOf(nodeId);
    if (idx <= 0) return; // 直前の兄弟が無い。境界チェックで無視する
    newParentId = siblingIds[idx - 1];
  }

  // 適用前に対象ノード＋配下全ての新しいlevelがKPI_LEVELSの範囲内か検証する
  const descendants = await collectDescendants(supabase, nodeId);
  const subtree: { id: string; content: KpiNodeContent }[] = [
    { id: nodeId, content: nodeContent },
    ...descendants.map((d) => ({ id: d.id, content: d.content })),
  ];
  for (const item of subtree) {
    const newIndex = KPI_LEVELS.indexOf(item.content.level) + delta;
    if (newIndex < 0 || newIndex >= KPI_LEVELS.length) {
      throw new UserFacingError(
        direction === "promote"
          ? "これ以上、階層を上げられません。"
          : "これ以上、階層を下げられません（戦術より深い階層は作れません）。"
      );
    }
  }

  for (const item of subtree) {
    const newLevel = KPI_LEVELS[KPI_LEVELS.indexOf(item.content.level) + delta];
    const { error } = await supabase
      .from("requirement_items")
      .update({ content: { ...item.content, level: newLevel } })
      .eq("id", item.id);
    if (error) throw new UserFacingError(errorMessage(error));
  }

  const { error: parentUpdateError } = await supabase
    .from("requirement_items")
    .update({ parent_id: newParentId })
    .eq("id", nodeId);
  if (parentUpdateError) throw new UserFacingError(errorMessage(parentUpdateError));

  // 新しい兄弟グループの末尾に付け直す（元の兄弟内でのorder_indexをそのまま引き継ぐと、
  // 新しい兄弟グループの中で意図しない位置に紛れ込む可能性があるため）
  const newSiblingIds = await fetchOrderedSiblingIds(supabase, projectId, newParentId);
  await applySiblingOrder(supabase, [...newSiblingIds.filter((id) => id !== nodeId), nodeId]);

  revalidatePath(`/projects/${projectId}/chapters/4`);
}

// フェーズ4：複製。対象ノード単体（子孫は複製しない、指示書の指定通り）を、同じ親・
// 直後の位置に、ステータスse_reviewingでコピーする。text以外のmetric/owner/due_dateも
// 含めた全content（levelは当然そのまま）をコピーする（「複製」の実装として自然なため）。
export async function duplicateKpiNode(nodeId: string, projectId: string, tenantId: string): Promise<string> {
  const supabase = await createServerActionClient();
  const { data: node, error: nodeError } = await supabase
    .from("requirement_items")
    .select("parent_id, content, status")
    .eq("id", nodeId)
    .single();
  if (nodeError || !node) throw new UserFacingError(nodeError ? errorMessage(nodeError) : "項目が見つかりません");
  if (isItemLocked(node.status)) throw new UserFacingError("確定済みの項目は複製できません");

  const { data: inserted, error: insertError } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 4,
      template_type: "D",
      parent_id: node.parent_id,
      content: { ...(node.content as KpiNodeContent) },
      status: "se_reviewing",
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new UserFacingError(insertError ? errorMessage(insertError) : "複製に失敗しました");
  const newId = (inserted as unknown as { id: string }).id;

  // 「直後の位置」に来るよう、複製元の直後に挿入する形で兄弟全体のorder_indexを振り直す
  const siblingIds = (await fetchOrderedSiblingIds(supabase, projectId, node.parent_id)).filter((id) => id !== newId);
  const originalIdx = siblingIds.indexOf(nodeId);
  const reordered = [...siblingIds];
  reordered.splice(originalIdx + 1, 0, newId);
  await applySiblingOrder(supabase, reordered);

  revalidatePath(`/projects/${projectId}/chapters/4`);
  return newId;
}

export async function deleteKpiNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  // parent_idの外部キーにon delete cascadeが無いため、子が残っている状態で削除すると
  // 23503（外部キー制約違反）になる。既存の挙動は変えず（フェーズ1の対象外）、
  // エラーメッセージだけユーザーに伝わる形にする（規約43：生のPostgrestErrorをthrowしない）。
  const { error } = await supabase.from("requirement_items").delete().eq("id", nodeId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/4`);
}
