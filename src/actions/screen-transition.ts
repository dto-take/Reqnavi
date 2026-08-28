"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

export type ScreenNode = { id: string; label: string; order_index: number };
export type ScreenEdge = { id: string; from_node: string; to_node: string; label: string | null };

export async function listScreenNodes(projectId: string): Promise<ScreenNode[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("id, label, order_index")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition")
    .order("order_index");
  if (error) throw error;
  return data as unknown as ScreenNode[];
}

export async function listScreenEdges(projectId: string): Promise<ScreenEdge[]> {
  const supabase = await createServerActionClient();
  const { data: nodesData } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition");
  const nodes = nodesData as unknown as { id: string }[] | null;
  if (!nodes || nodes.length === 0) return [];

  const { data, error } = await supabase
    .from("flow_edges")
    .select("id, from_node, to_node, label")
    .in("from_node", nodes.map((n) => n.id));
  if (error) throw error;
  return data as unknown as ScreenEdge[];
}

export async function addScreenNode(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  const { data: existingData } = await supabase
    .from("flow_nodes")
    .select("order_index")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition")
    .order("order_index", { ascending: false })
    .limit(1);
  const existing = existingData as unknown as { order_index: number }[] | null;
  const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

  const { error } = await supabase.from("flow_nodes").insert({
    project_id: projectId,
    tenant_id: tenantId,
    flow_type: "screen_transition",
    label: formData.get("label") as string,
    order_index: nextOrder,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}

export async function addScreenTransition(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();

  const fromNode = formData.get("from_node") as string;
  const toNode = formData.get("to_node") as string;

  // from_nodeの案件所属はflow_edges_insertポリシーが検証するが、to_nodeは検証対象外
  // （ポリシーがfrom_nodeしか見ていないため）。ここで両方が同一案件のscreen_transitionノードで
  // あることを確認しないと、他案件のノードIDをto_nodeに指定した遷移が作成できてしまう。
  const { data: validNodesData } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition")
    .in("id", [fromNode, toNode]);
  const validNodes = validNodesData as unknown as { id: string }[] | null;
  if (!validNodes || validNodes.length !== 2) {
    throw new UserFacingError("不正な画面が指定されました");
  }

  const { error } = await supabase.from("flow_edges").insert({
    from_node: fromNode,
    to_node: toNode,
    label: formData.get("label") as string,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}

export async function deleteScreenNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  // flow_edgesはon delete cascadeが設定済み（Phase2 Step1で対応済み）のため、
  // ノード削除だけで関連edgeも自動的に削除される
  const { error } = await supabase.from("flow_nodes").delete().eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}
