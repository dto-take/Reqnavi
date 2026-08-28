"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { KpiLevel } from "@/lib/kpi-levels";

// "use server"ファイルは非同期関数以外をexportできない。KPI_LEVELS（実行時の配列値）は
// src/lib/kpi-levels.tsへ切り出し済み。KpiLevel型はexport type {}での再exportすら
// Next.jsのServer Actionsマニフェスト生成でエラーになるため、ここではimportのみに留め、
// 利用側（KpiTree.tsx等）には@/lib/kpi-levelsから直接importしてもらう。

export type KpiNode = {
  id: string;
  parent_id: string | null;
  content: { level: KpiLevel; text: string };
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

export async function createKpiNode(
  projectId: string,
  tenantId: string,
  parentId: string | null,
  level: KpiLevel
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").insert({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 4,
    template_type: "D",
    parent_id: parentId,
    content: { level, text: "" },
    status: "se_reviewing",
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}

export async function updateKpiNodeText(nodeId: string, projectId: string, text: string) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("id", nodeId)
    .single();
  if (fetchError) throw fetchError;

  const currentContent = current.content as KpiNode["content"];
  const { error } = await supabase
    .from("requirement_items")
    .update({ content: { ...currentContent, text } })
    .eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}

export async function deleteKpiNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").delete().eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}
