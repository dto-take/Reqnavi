"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

export type FlowType = "business_asis" | "business_tobe";

export type FlowStep = {
  id: string;
  label: string;
  role_lane: string | null;
  system_used: string | null;
  order_index: number;
};

type FlowNodeOrderRow = { id: string; order_index: number };

export type FlowEdge = { from_node: string; to_node: string };

export async function listFlowSteps(projectId: string, flowType: FlowType): Promise<FlowStep[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("id, label, role_lane, system_used, order_index")
    .eq("project_id", projectId)
    .eq("flow_type", flowType)
    .order("order_index");
  if (error) throw error;
  return data as unknown as FlowStep[];
}

export async function listFlowEdges(projectId: string, flowType: FlowType): Promise<FlowEdge[]> {
  const supabase = await createServerActionClient();
  const { data: nodeIdsData } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", flowType);
  const nodeIds = nodeIdsData as unknown as { id: string }[] | null;
  if (!nodeIds || nodeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("flow_edges")
    .select("from_node, to_node")
    .in("from_node", nodeIds.map((n) => n.id));
  if (error) throw error;
  return data as unknown as FlowEdge[];
}

export async function addFlowStep(
  projectId: string,
  flowType: FlowType,
  formData: FormData
) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  const { data: existingData } = await supabase
    .from("flow_nodes")
    .select("order_index")
    .eq("project_id", projectId)
    .eq("flow_type", flowType)
    .order("order_index", { ascending: false })
    .limit(1);
  const existing = existingData as unknown as { order_index: number }[] | null;
  const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

  const { error } = await supabase.from("flow_nodes").insert({
    project_id: projectId,
    tenant_id: tenantId,
    flow_type: flowType,
    label: formData.get("label") as string,
    role_lane: formData.get("role_lane") as string,
    system_used: formData.get("system_used") as string,
    order_index: nextOrder,
  });
  if (error) throw error;

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}

export async function moveFlowStep(
  stepId: string,
  projectId: string,
  flowType: FlowType,
  newRoleLane: string,
  orderedStepIds: string[]
) {
  const supabase = await createServerActionClient();

  const { error: laneError } = await supabase
    .from("flow_nodes")
    .update({ role_lane: newRoleLane })
    .eq("id", stepId);
  if (laneError) throw laneError;

  for (let i = 0; i < orderedStepIds.length; i++) {
    const { error } = await supabase
      .from("flow_nodes")
      .update({ order_index: i })
      .eq("id", orderedStepIds[i]);
    if (error) throw error;
  }

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}

export async function deleteFlowStep(stepId: string, projectId: string, flowType: FlowType) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("flow_nodes").delete().eq("id", stepId);
  if (error) throw error;

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}

// order_indexの並び順に沿って、連続するステップ間のedgeを再生成する
// （Step1では手動でのedge編集は行わず、リストの並び＝フローの順序とする）
async function regenerateEdges(projectId: string, flowType: FlowType) {
  const supabase = await createServerActionClient();
  const { data: nodesData } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", flowType)
    .order("order_index");
  const nodes = nodesData as unknown as FlowNodeOrderRow[] | null;
  if (!nodes) return;

  const nodeIds = nodes.map((n) => n.id);
  if (nodeIds.length > 0) {
    await supabase.from("flow_edges").delete().in("from_node", nodeIds);
  }

  const newEdges = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    newEdges.push({ from_node: nodeIds[i], to_node: nodeIds[i + 1] });
  }
  if (newEdges.length > 0) {
    await supabase.from("flow_edges").insert(newEdges);
  }
}
