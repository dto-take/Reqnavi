"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ChecklistItem = { item: string; status: "済" | "未" | "対象外" };
export type ChecklistContent = { category: string; overview: string; checklist: ChecklistItem[] };

export type ChecklistCategoryRow = {
  id: string;
  content: ChecklistContent;
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved";
};

export async function listChecklistCategories(projectId: string): Promise<ChecklistCategoryRow[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, content, status")
    .eq("project_id", projectId)
    .eq("chapter_no", 10)
    .eq("template_type", "E")
    .order("order_index");
  if (error) throw error;
  return data as unknown as ChecklistCategoryRow[];
}

export async function createChecklistCategory(projectId: string, tenantId: string, category: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").insert({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 10,
    template_type: "E",
    content: { category, overview: "", checklist: [] } satisfies ChecklistContent,
    status: "se_reviewing",
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/10`);
}

export async function updateChecklistContent(
  itemId: string,
  projectId: string,
  content: ChecklistContent
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ content })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/10`);
}
