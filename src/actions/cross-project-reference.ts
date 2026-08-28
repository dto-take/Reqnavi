"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

export type CrossProjectItem = {
  id: string;
  project_id: string;
  content: Record<string, string>;
  template_type: string;
  projects: { name: string } | null;
};

export async function listCrossProjectReferences(currentProjectId: string, chapterNo: number): Promise<CrossProjectItem[]> {
  const supabase = await createServerActionClient();
  // RLS（can_view_cross_project_item）が、自案件以外の確定済み項目のみを絞り込んで返す
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, project_id, content, template_type, projects(name)")
    .neq("project_id", currentProjectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;
  return data as unknown as CrossProjectItem[];
}

export async function copyReferenceItem(
  currentProjectId: string,
  chapterNo: number,
  templateType: string,
  content: Record<string, string>
) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  const { error } = await supabase.from("requirement_items").insert({
    project_id: currentProjectId,
    tenant_id: tenantId,
    chapter_no: chapterNo,
    template_type: templateType,
    content,
    status: "ai_draft",
  });
  if (error) throw error;
  revalidatePath(`/projects/${currentProjectId}/chapters/${chapterNo}`);
}
