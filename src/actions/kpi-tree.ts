"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { isItemLocked } from "@/lib/item-lock";
import { revalidatePath } from "next/cache";
import type { KpiLevel } from "@/lib/kpi-levels";

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
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, parent_id, content, status")
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .eq("template_type", "D")
    .order("order_index");
  if (error) throw error;
  return data as unknown as KpiNode[];
}

// idを返すのは、追加直後に新しいノードを選択状態にするため（旧・単一ツリー表示では
// 追加直後の空欄がその場に見えていたのに対し、2ペイン化で追加先が別ペインの
// ツリー内に埋もれてしまうと使い勝手が退行するため。既存機能の移植として実装）。
export async function createKpiNode(
  projectId: string,
  tenantId: string,
  parentId: string | null,
  level: KpiLevel
): Promise<string> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 4,
      template_type: "D",
      parent_id: parentId,
      content: { level, text: "" },
      status: "se_reviewing",
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

export async function deleteKpiNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  // parent_idの外部キーにon delete cascadeが無いため、子が残っている状態で削除すると
  // 23503（外部キー制約違反）になる。既存の挙動は変えず（フェーズ1の対象外）、
  // エラーメッセージだけユーザーに伝わる形にする（規約43：生のPostgrestErrorをthrowしない）。
  const { error } = await supabase.from("requirement_items").delete().eq("id", nodeId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/4`);
}
