import type { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { gridPosition } from "@/lib/screen-flow/derive";
import { isItemLocked } from "@/lib/item-lock";

// 画面ノード・遷移の作成処理。Server Action（"use server"ファイルはasync関数しかexportできない）
// から共用する。手動の「画面の追加」とAI提案の採用（screen_flow_ux_phase3.md）が同じ処理を通る
// ことで、画面ID(S-NN)の採番・9章紐付けの一意性・遷移の検証を重複実装しない。

export type Supabase = Awaited<ReturnType<typeof createServerActionClient>>;

type NodeRow = {
  id: string;
  screen_code: string | null;
  order_index: number;
  function_item_id: string | null;
  status: string;
};

export async function projectNodes(supabase: Supabase, projectId: string): Promise<NodeRow[]> {
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("id, screen_code, order_index, function_item_id, status")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition");
  if (error) throw new UserFacingError(errorMessage(error));
  return data as unknown as NodeRow[];
}

export async function assertFunctionUsable(
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

export async function createScreenNodeRow(
  supabase: Supabase,
  projectId: string,
  tenantId: string,
  input: { name: string; functionItemId?: string | null; status: "ai_draft" | "se_reviewing"; position?: { x: number; y: number } }
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new UserFacingError("画面名を入力してください");
  if (input.functionItemId) await assertFunctionUsable(supabase, projectId, input.functionItemId);

  const nodes = await projectNodes(supabase, projectId);
  const maxCode = nodes.reduce((m, n) => {
    const num = Number(n.screen_code?.replace(/^S-/, ""));
    return Number.isFinite(num) ? Math.max(m, num) : m;
  }, 0);
  const maxOrder = nodes.reduce((m, n) => Math.max(m, n.order_index), -1);
  const pos = input.position ?? gridPosition(nodes.length);

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
      status: input.status,
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "画面の作成に失敗しました");
  return (data as unknown as { id: string }).id;
}

export async function createScreenEdgeRow(
  supabase: Supabase,
  projectId: string,
  fromNodeId: string,
  toNodeId: string,
  label?: string | null
): Promise<string> {
  if (fromNodeId === toNodeId) throw new UserFacingError("同じ画面への遷移は作れません");
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
  return (data as unknown as { id: string }).id;
}
