"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";
import type { ProgressTask } from "@/lib/gantt/layout";

export async function listProgressTasks(projectId: string): Promise<ProgressTask[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("progress_tasks")
    .select("id, task_name, owner_primary, owner_secondary, week_start, week_end, percent_complete")
    .eq("project_id", projectId)
    .order("week_start");
  if (error) throw error;
  return data as unknown as ProgressTask[];
}

export async function addProgressTask(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  const { error } = await supabase.from("progress_tasks").insert({
    project_id: projectId,
    tenant_id: tenantId,
    task_name: formData.get("task_name") as string,
    owner_primary: formData.get("owner_primary") as string,
    owner_secondary: formData.get("owner_secondary") as string,
    week_start: formData.get("week_start") as string,
    week_end: formData.get("week_end") as string,
    percent_complete: 0,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/15`);
}

export async function updatePercentComplete(taskId: string, projectId: string, percent: number) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("progress_tasks")
    .update({ percent_complete: percent })
    .eq("id", taskId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/15`);
}

export async function deleteProgressTask(taskId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("progress_tasks").delete().eq("id", taskId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/15`);
}
