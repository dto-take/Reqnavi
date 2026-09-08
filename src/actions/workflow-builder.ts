"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";

// 業務フロービルダー（条件分岐対応、flow_type='business_builder'）専用のServer Action群。
// 既存のsrc/actions/business-flow.ts（order_indexのみに基づく単純な直線チェーン＋
// regenerateEdges()前提）とはデータモデルが異なる（ツリー構造）ため、意図的に別ファイルに分離している。

export type ConditionRule = { field: string; op: string; value: string };

export type WorkflowNodeRow = {
  id: string;
  node_type: string;
  label: string;
  role_lane: string;
  mode: string | null;
  system_used: string | null;
  screen_id: string | null;
  sys_kind: string | null;
  input_data: string | null;
  output_data: string | null;
  business_rule: string | null;
  channel: string | null;
  condition_logic: "all" | "any" | null;
  condition_rules: ConditionRule[];
  branch: "main" | "yes" | "no";
  parent_condition_id: string | null;
  order_index: number;
};

const NODE_COLUMNS =
  "id, node_type, label, role_lane, mode, system_used, screen_id, sys_kind, input_data, output_data, business_rule, channel, condition_logic, condition_rules, branch, parent_condition_id, order_index";

export async function listWorkflowNodes(projectId: string): Promise<WorkflowNodeRow[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .select(NODE_COLUMNS)
    .eq("project_id", projectId)
    .eq("flow_type", "business_builder")
    .order("order_index");
  if (error) throw new Error(errorMessage(error));
  return (data as unknown as WorkflowNodeRow[]) ?? [];
}

// NodeEditPanelのonBlur/デバウンスから、onClick的にstartTransition経由で呼ばれる
// （<form action>を介さない）ため、規約44に従いthrowではなく戻り値のerrorで失敗を返す。
export async function updateFlowNode(
  nodeId: string,
  projectId: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();
    const tenantId = await getTenantId(supabase);
    if (!tenantId) throw new UserFacingError("認証が必要です");

    const { error } = await supabase.from("flow_nodes").update(patch).eq("id", nodeId);
    if (error) throw error;

    revalidatePath(`/projects/${projectId}/business-flow/builder`);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// フェーズDの本格的なパレット（挿入位置ルール・条件分岐/Yes-No追加）が実装されるまでの暫定対応。
// 本線（branch='main'）の末尾に「手動タスク」を1件追加するだけの最小機能（指示書のスコープ限定）。
export async function appendWorkflowNode(projectId: string, tenantId: string) {
  const supabase = await createServerActionClient();

  const { data: mainNodes } = await supabase
    .from("flow_nodes")
    .select("order_index, role_lane")
    .eq("project_id", projectId)
    .eq("flow_type", "business_builder")
    .eq("branch", "main")
    .order("order_index", { ascending: false })
    .limit(1);

  const nextOrderIndex = (mainNodes?.[0]?.order_index ?? -1) + 1;
  const defaultLane = mainNodes?.[0]?.role_lane ?? "担当者";

  const { error } = await supabase.from("flow_nodes").insert({
    project_id: projectId,
    tenant_id: tenantId,
    flow_type: "business_builder",
    node_type: "task",
    label: "新しい工程",
    role_lane: defaultLane,
    branch: "main",
    parent_condition_id: null,
    order_index: nextOrderIndex,
  });
  if (error) throw new Error(errorMessage(error));

  revalidatePath(`/projects/${projectId}/business-flow/builder`);
}

// 本フェーズ（A+B）は単純な削除のみでよい（条件分岐ノード削除時のYesルート展開等の
// 完全な追加・削除ルールはフェーズD対応）。parent_condition_idはon delete cascadeのため、
// 条件分岐ノードを削除するとその配下（yes/no）は自動的にまとめて削除される。
export async function deleteWorkflowNode(nodeId: string, projectId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();
    const { error } = await supabase.from("flow_nodes").delete().eq("id", nodeId);
    if (error) throw error;

    revalidatePath(`/projects/${projectId}/business-flow/builder`);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
