"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";

export type EffortLog = {
  id: string;
  work_start_date: string;
  work_end_date: string;
  hours_spent: number;
  note: string | null;
  recorded_by: string;
};

export async function listEffortLogs(projectId: string): Promise<EffortLog[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("effort_logs")
    .select("id, work_start_date, work_end_date, hours_spent, note, recorded_by")
    .eq("project_id", projectId)
    .order("work_start_date", { ascending: false });
  if (error) throw error;
  return data as unknown as EffortLog[];
}

export async function createEffortLog(
  projectId: string,
  tenantId: string,
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("認証が必要です");

    const workStartDate = formData.get("work_start_date") as string;
    const workEndDate = formData.get("work_end_date") as string;
    const hoursSpent = Number(formData.get("hours_spent"));
    const note = (formData.get("note") as string) || null;

    const { error } = await supabase.from("effort_logs").insert({
      project_id: projectId,
      tenant_id: tenantId,
      recorded_by: userData.user.id,
      work_start_date: workStartDate,
      work_end_date: workEndDate,
      hours_spent: hoursSpent,
      note,
    });
    if (error) throw error;

    revalidatePath(`/projects/${projectId}/effort`);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteEffortLog(logId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("effort_logs").delete().eq("id", logId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/effort`);
}
