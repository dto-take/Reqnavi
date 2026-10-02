"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { assertFunctionUsable, createScreenEdgeRow, createScreenNodeRow, type Supabase } from "@/lib/screen-flow/node-ops";
import { isItemLocked } from "@/lib/item-lock";
import { revalidatePath } from "next/cache";

// screen_flow_ux_phase1.md：画面遷移図（flow_type='screen_transition'）のServer Action群。
// ステータスはrequirement_itemsと同じ値（ai_draft/se_reviewing/confirmed）を使う。

export type ScreenNodeStatus = "ai_draft" | "se_reviewing" | "confirmed";

export type ScreenNode = {
  id: string;
  label: string;
  order_index: number;
  pos_x: number | null;
  pos_y: number | null;
  function_item_id: string | null;
  screen_code: string | null;
  status: ScreenNodeStatus;
};
export type ScreenEdge = { id: string; from_node: string; to_node: string; label: string | null };

function path(projectId: string) {
  return `/projects/${projectId}/chapters/9/screen-transitions`;
}

export async function listScreenNodes(projectId: string): Promise<ScreenNode[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("id, label, order_index, pos_x, pos_y, function_item_id, screen_code, status")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition")
    .order("order_index")
    .order("id");
  if (error) throw error;
  return data as unknown as ScreenNode[];
}

export async function listScreenEdges(projectId: string): Promise<ScreenEdge[]> {
  const supabase = await createServerActionClient();
  const { data: nodes } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition");
  const ids = (nodes ?? []).map((n) => n.id as string);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("flow_edges")
    .select("id, from_node, to_node, label")
    .in("from_node", ids)
    .order("id");
  if (error) throw error;
  return data as unknown as ScreenEdge[];
}

// 規約47：RLSで弾かれたUPDATE/DELETEはエラーにならず0件になるため、件数を必ず確認する。
function assertAffected(data: unknown[] | null, message: string) {
  if (!data || data.length === 0) throw new UserFacingError(message);
}

// screen_flow_ux_phase2.md：確定済み（isItemLocked）のノードは中身（画面名・9章紐付け・
// そのノードを遷移元とする遷移）を変更できない。UIで隠すだけでなく必ずここでも拒否する（規約33）。
// 位置の保存・画面の削除はレイアウト/削除であり内容の変更ではないため、このガードを付けない。
async function fetchNodeStatus(supabase: Supabase, nodeId: string): Promise<ScreenNodeStatus> {
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("status")
    .eq("id", nodeId)
    .eq("flow_type", "screen_transition")
    .maybeSingle();
  if (error) throw new UserFacingError(errorMessage(error));
  if (!data) throw new UserFacingError("画面が見つかりません");
  return (data as unknown as { status: ScreenNodeStatus }).status;
}

async function assertNodeEditable(supabase: Supabase, nodeId: string): Promise<ScreenNodeStatus> {
  const status = await fetchNodeStatus(supabase, nodeId);
  if (isItemLocked(status)) throw new UserFacingError("確定済みの画面は編集できません");
  return status;
}

// ステージの論理サイズは内容に合わせて広がる（自動整列で右へ伸びる）ため、サーバー側では
// 負の値と極端に大きな値だけを弾き、ステージ上限でのクランプはしない。
const MAX_COORD = 20000;
function clampStored(x: number, y: number) {
  return {
    x: Math.min(Math.max(0, Math.round(x)), MAX_COORD),
    y: Math.min(Math.max(0, Math.round(y)), MAX_COORD),
  };
}

export async function moveScreenNode(nodeId: string, projectId: string, x: number, y: number) {
  const supabase = await createServerActionClient();
  const pos = clampStored(x, y);
  const { data, error } = await supabase
    .from("flow_nodes")
    .update({ pos_x: pos.x, pos_y: pos.y })
    .eq("id", nodeId)
    .eq("flow_type", "screen_transition")
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  assertAffected(data, "画面の位置を保存できませんでした");
  revalidatePath(path(projectId));
}

export async function addScreenNode(
  projectId: string,
  input: { name: string; functionItemId?: string | null }
): Promise<string> {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");
  const id = await createScreenNodeRow(supabase, projectId, tenantId, { ...input, status: "se_reviewing" });
  revalidatePath(path(projectId));
  return id;
}

export async function renameScreenNode(nodeId: string, projectId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new UserFacingError("画面名を入力してください");
  const supabase = await createServerActionClient();
  const status = await assertNodeEditable(supabase, nodeId);
  const { data, error } = await supabase
    .from("flow_nodes")
    .update({ label: trimmed, ...(status === "ai_draft" ? { status: "se_reviewing" } : {}) })
    .eq("id", nodeId)
    .eq("flow_type", "screen_transition")
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  assertAffected(data, "画面名を更新できませんでした");
  revalidatePath(path(projectId));
}

// 接続する遷移はflow_edgesの外部キー（from_node/to_node、ON DELETE CASCADE）で一緒に削除される。
export async function removeScreenNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("flow_type", "screen_transition")
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  assertAffected(data, "画面を削除できませんでした");
  revalidatePath(path(projectId));
}

export async function linkScreenFunction(nodeId: string, projectId: string, functionItemId: string | null) {
  const supabase = await createServerActionClient();
  const status = await assertNodeEditable(supabase, nodeId);
  if (functionItemId) await assertFunctionUsable(supabase, projectId, functionItemId, nodeId);
  const { data, error } = await supabase
    .from("flow_nodes")
    .update({ function_item_id: functionItemId, ...(status === "ai_draft" ? { status: "se_reviewing" } : {}) })
    .eq("id", nodeId)
    .eq("flow_type", "screen_transition")
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  assertAffected(data, "紐付けを更新できませんでした");
  revalidatePath(path(projectId));
}

export async function addScreenTransition(
  projectId: string,
  fromNodeId: string,
  toNodeId: string,
  label?: string
): Promise<string> {
  const supabase = await createServerActionClient();
  const id = await createScreenEdgeRow(supabase, projectId, fromNodeId, toNodeId, label);
  revalidatePath(path(projectId));
  return id;
}

async function assertEdgeEditable(supabase: Supabase, edgeId: string) {
  const { data, error } = await supabase.from("flow_edges").select("from_node").eq("id", edgeId).maybeSingle();
  if (error) throw new UserFacingError(errorMessage(error));
  if (!data) throw new UserFacingError("遷移が見つかりません");
  const status = await fetchNodeStatus(supabase, (data as unknown as { from_node: string }).from_node);
  if (isItemLocked(status)) throw new UserFacingError("確定済みの画面からの遷移は編集できません");
}

export async function updateScreenTransitionLabel(edgeId: string, projectId: string, label: string) {
  const supabase = await createServerActionClient();
  await assertEdgeEditable(supabase, edgeId);
  const { data, error } = await supabase
    .from("flow_edges")
    .update({ label: label.trim() ? label.trim() : null })
    .eq("id", edgeId)
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  assertAffected(data, "操作名を更新できませんでした");
  revalidatePath(path(projectId));
}

export async function removeScreenTransition(edgeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  await assertEdgeEditable(supabase, edgeId);
  const { data, error } = await supabase.from("flow_edges").delete().eq("id", edgeId).select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  assertAffected(data, "遷移を削除できませんでした");
  revalidatePath(path(projectId));
}

// 自動整列など複数ノードの位置をまとめて保存する。規約47：RLSで弾かれたUPDATEは黙って0件に
// なるため、更新できた件数が対象件数と一致しなければエラーにする。
export async function moveScreenNodes(projectId: string, moves: { id: string; x: number; y: number }[]) {
  if (moves.length === 0) return;
  const supabase = await createServerActionClient();
  let updated = 0;
  for (const m of moves) {
    const pos = clampStored(m.x, m.y);
    const { data, error } = await supabase
      .from("flow_nodes")
      .update({ pos_x: pos.x, pos_y: pos.y })
      .eq("id", m.id)
      .eq("project_id", projectId)
      .eq("flow_type", "screen_transition")
      .select("id");
    if (error) throw new UserFacingError(errorMessage(error));
    updated += data?.length ?? 0;
  }
  if (updated !== moves.length) {
    throw new UserFacingError(`位置を保存できなかった画面があります（${updated}/${moves.length}件）`);
  }
  revalidatePath(path(projectId));
}

export async function confirmScreenNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .update({ status: "confirmed" })
    .eq("id", nodeId)
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition")
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  assertAffected(data, "画面を確定できませんでした");
  revalidatePath(path(projectId));
}
