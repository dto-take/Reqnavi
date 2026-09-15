"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";
import type { ProgressTask } from "@/lib/gantt/layout";

export async function listProgressTasks(projectId: string): Promise<ProgressTask[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("progress_tasks")
    .select("id, parent_id, task_name, owner_primary, owner_secondary, week_start, week_end, order_index")
    .eq("project_id", projectId)
    .order("order_index")
    .order("created_at");
  if (error) throw error;
  return data as unknown as ProgressTask[];
}

async function nextOrderIndex(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  projectId: string,
  parentId: string | null
): Promise<number> {
  let query = supabase.from("progress_tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { count, error } = await query;
  if (error) throw new UserFacingError(errorMessage(error));
  return count ?? 0;
}

// 末尾に大工程を追加する（＋ 大工程）。作成後は選択状態にしてインライン編集にフォーカスする想定。
export async function createPhase(projectId: string, tenantId: string): Promise<string> {
  const supabase = await createServerActionClient();
  const orderIndex = await nextOrderIndex(supabase, projectId, null);
  const { data, error } = await supabase
    .from("progress_tasks")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      parent_id: null,
      task_name: "",
      order_index: orderIndex,
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "作成に失敗しました");
  revalidatePath(`/projects/${projectId}/chapters/15`);
  return (data as unknown as { id: string }).id;
}

// 選択中の大工程の末尾に中工程を追加する。開始日は、直前の中工程があればその翌日、
// 無ければ今日を初期値とする（1日分のプレースホルダ期間）。
export async function createTask(projectId: string, tenantId: string, phaseId: string): Promise<string> {
  const supabase = await createServerActionClient();
  const { data: siblingsData, error: siblingsError } = await supabase
    .from("progress_tasks")
    .select("week_end")
    .eq("project_id", projectId)
    .eq("parent_id", phaseId)
    .order("order_index", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (siblingsError) throw new UserFacingError(errorMessage(siblingsError));

  const lastEnd = (siblingsData?.[0] as unknown as { week_end: string | null } | undefined)?.week_end ?? null;
  const start = lastEnd ? addDays(lastEnd, 1) : todayIso();

  const orderIndex = await nextOrderIndex(supabase, projectId, phaseId);
  const { data, error } = await supabase
    .from("progress_tasks")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      parent_id: phaseId,
      task_name: "",
      week_start: start,
      week_end: start,
      order_index: orderIndex,
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "作成に失敗しました");
  revalidatePath(`/projects/${projectId}/chapters/15`);
  return (data as unknown as { id: string }).id;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ProgressTaskField = "task_name" | "owner_primary" | "owner_secondary" | "week_start" | "week_end";

// 名称は大工程・中工程どちらも編集可能。期間・担当は中工程のみ（大工程は自動集計のため
// 直接編集させない。UI側でもフィールド自体を出さないが、Server Action側でも二重に防御する）。
export async function updateProgressTaskField(
  taskId: string,
  projectId: string,
  field: ProgressTaskField,
  value: string
) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("progress_tasks")
    .select("parent_id, week_start, week_end")
    .eq("id", taskId)
    .single();
  if (fetchError || !current) throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");

  const row = current as unknown as { parent_id: string | null; week_start: string | null; week_end: string | null };
  if (field !== "task_name" && row.parent_id === null) {
    throw new UserFacingError("大工程の期間・担当は中工程から自動集計されるため、直接編集できません");
  }

  const nextValues: Record<string, string> = { [field]: value };
  if (field === "week_start" && row.week_end && value > row.week_end) {
    nextValues.week_end = value;
  }
  if (field === "week_end" && row.week_start && value < row.week_start) {
    throw new UserFacingError("終了日は開始日以降にしてください");
  }

  const { error } = await supabase.from("progress_tasks").update(nextValues).eq("id", taskId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/15`);
}

// 大工程を削除する場合、配下に中工程が残っていると外部キー制約で失敗する。
// KPIツリー等と同じ方針で、事前に子の有無を確認しユーザー向けの分かりやすいエラーにする。
export async function deleteProgressTask(taskId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { data: node, error: fetchError } = await supabase
    .from("progress_tasks")
    .select("parent_id")
    .eq("id", taskId)
    .single();
  if (fetchError || !node) throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");

  const isTargetPhase = (node as unknown as { parent_id: string | null }).parent_id === null;
  if (isTargetPhase) {
    const { count, error: countError } = await supabase
      .from("progress_tasks")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", taskId);
    if (countError) throw new UserFacingError(errorMessage(countError));
    if ((count ?? 0) > 0) {
      throw new UserFacingError("配下に中工程が残っているため削除できません。先に中工程を削除してください。");
    }
  }

  const { error } = await supabase.from("progress_tasks").delete().eq("id", taskId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/15`);
}
