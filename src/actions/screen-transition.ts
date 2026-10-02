"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { gridPosition } from "@/lib/screen-flow/derive";
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

type Supabase = Awaited<ReturnType<typeof createServerActionClient>>;

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

async function projectNodes(supabase: Supabase, projectId: string) {
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("id, screen_code, order_index, function_item_id, status")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition");
  if (error) throw new UserFacingError(errorMessage(error));
  return data as unknown as { id: string; screen_code: string | null; order_index: number; function_item_id: string | null; status: string }[];
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

async function assertFunctionUsable(
  supabase: Supabase,
  projectId: string,
  functionItemId: string,
  exceptNodeId?: string
) {
  const { data: item } = await supabase
    .from("requirement_items")
    .select("id, status")
    .eq("id", functionItemId)
    .eq("project_id", projectId)
    .eq("chapter_no", 9)
    .maybeSingle();
  if (!item) throw new UserFacingError("指定された9章の項目が見つかりません");
  const nodes = await projectNodes(supabase, projectId);
  if (nodes.some((n) => n.function_item_id === functionItemId && n.id !== exceptNodeId)) {
    throw new UserFacingError("この9章の項目は既に別の画面に紐付いています");
  }
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
  const name = input.name.trim();
  if (!name) throw new UserFacingError("画面名を入力してください");
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");
  if (input.functionItemId) await assertFunctionUsable(supabase, projectId, input.functionItemId);

  const nodes = await projectNodes(supabase, projectId);
  const maxCode = nodes.reduce((m, n) => {
    const num = Number(n.screen_code?.replace(/^S-/, ""));
    return Number.isFinite(num) ? Math.max(m, num) : m;
  }, 0);
  const maxOrder = nodes.reduce((m, n) => Math.max(m, n.order_index), -1);
  const pos = gridPosition(nodes.length);

  const { data, error } = await supabase
    .from("flow_nodes")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      flow_type: "screen_transition",
      label: name,
      order_index: maxOrder + 1,
      screen_code: `S-${String(maxCode + 1).padStart(2, "0")}`,
      pos_x: pos.x,
      pos_y: pos.y,
      function_item_id: input.functionItemId ?? null,
      status: "se_reviewing",
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "画面の作成に失敗しました");
  revalidatePath(path(projectId));
  return (data as unknown as { id: string }).id;
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
  if (fromNodeId === toNodeId) throw new UserFacingError("同じ画面への遷移は作れません");
  const supabase = await createServerActionClient();
  const nodes = await projectNodes(supabase, projectId);
  const ids = new Set(nodes.map((n) => n.id));
  if (!ids.has(fromNodeId) || !ids.has(toNodeId)) throw new UserFacingError("不正な画面が指定されました");
  // 遷移の所有者は遷移元。遷移元が確定済みなら追加できない（遷移先が確定済みなのは可）。
  const fromNode = nodes.find((n) => n.id === fromNodeId)!;
  if (isItemLocked(fromNode.status)) throw new UserFacingError("確定済みの画面からは遷移を追加できません");

  const { data: existing } = await supabase
    .from("flow_edges")
    .select("id")
    .eq("from_node", fromNodeId)
    .eq("to_node", toNodeId)
    .maybeSingle();
  if (existing) throw new UserFacingError("この遷移は既に存在します");

  const { data, error } = await supabase
    .from("flow_edges")
    .insert({ from_node: fromNodeId, to_node: toNodeId, label: label?.trim() ? label.trim() : null })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "遷移の作成に失敗しました");
  revalidatePath(path(projectId));
  return (data as unknown as { id: string }).id;
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
