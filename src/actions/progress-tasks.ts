"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";
import { wouldCreateCycle, addDaysIso, dayDiffIso, type ProgressTask } from "@/lib/gantt/layout";

export async function listProgressTasks(projectId: string): Promise<ProgressTask[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("progress_tasks")
    .select("id, parent_id, task_name, owner_primary, owner_secondary, week_start, week_end, order_index, predecessor_id")
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

// progress_ux_phase3.md Step2：先行工程を設定する。中工程にのみ設定可能で、循環参照になる
// 設定は拒否する（対象タスクの祖先方向にpredecessorIdを遡り、自分自身に戻ってこないか確認する）。
export async function setPredecessor(taskId: string, projectId: string, predecessorId: string | null) {
  const supabase = await createServerActionClient();
  const { data: currentData, error: fetchError } = await supabase
    .from("progress_tasks")
    .select("id, parent_id")
    .eq("id", taskId)
    .single();
  if (fetchError || !currentData) throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");
  const current = currentData as unknown as { id: string; parent_id: string | null };
  if (current.parent_id === null) throw new UserFacingError("大工程には先行工程を設定できません");

  if (predecessorId !== null) {
    if (predecessorId === taskId) throw new UserFacingError("自分自身を先行工程には設定できません");

    const { data: predData, error: predError } = await supabase
      .from("progress_tasks")
      .select("id, project_id, parent_id")
      .eq("id", predecessorId)
      .single();
    if (predError || !predData) throw new UserFacingError(predError ? errorMessage(predError) : "先行工程が見つかりません");
    const pred = predData as unknown as { id: string; project_id: string; parent_id: string | null };
    if (pred.project_id !== projectId) throw new UserFacingError("同じ案件内の中工程のみ先行工程に設定できます");
    if (pred.parent_id === null) throw new UserFacingError("大工程は先行工程に設定できません");

    const { data: allData, error: allError } = await supabase
      .from("progress_tasks")
      .select("id, parent_id, task_name, owner_primary, owner_secondary, week_start, week_end, order_index, predecessor_id")
      .eq("project_id", projectId);
    if (allError) throw new UserFacingError(errorMessage(allError));
    const nodes = allData as unknown as ProgressTask[];
    if (wouldCreateCycle(nodes, taskId, predecessorId)) {
      throw new UserFacingError("この設定では先行工程の循環参照が発生するため、設定できません。");
    }
  }

  const { error } = await supabase.from("progress_tasks").update({ predecessor_id: predecessorId }).eq("id", taskId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/15`);
}

// progress_ux_phase3.md Step5：ドラッグ（移動・端の伸縮）で中工程の期間を変更する。
// 変更後の終了日が後続工程（このタスクをpredecessor_idとする中工程）の開始日を追い越す場合、
// 後続の開始日を「終了日の翌日」に繰り下げ、期間の長さを保ったまま終了日も同じ日数だけ後ろへずらす。
// 後続の後続へも同じ判定を再帰的に適用する（カスケード）。
export async function shiftTaskDates(taskId: string, projectId: string, newStart: string, newEnd: string) {
  if (newEnd < newStart) throw new UserFacingError("終了日は開始日以降にしてください");

  const supabase = await createServerActionClient();
  const { data: currentData, error: fetchError } = await supabase
    .from("progress_tasks")
    .select("id, parent_id")
    .eq("id", taskId)
    .single();
  if (fetchError || !currentData) throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");
  if ((currentData as unknown as { parent_id: string | null }).parent_id === null) {
    throw new UserFacingError("大工程の期間は中工程から自動集計されるため、直接編集できません");
  }

  const { data: allTasksData, error: allTasksError } = await supabase
    .from("progress_tasks")
    .select("id, week_start, week_end, predecessor_id")
    .eq("project_id", projectId)
    .not("parent_id", "is", null);
  if (allTasksError) throw new UserFacingError(errorMessage(allTasksError));
  type TaskRow = { id: string; week_start: string | null; week_end: string | null; predecessor_id: string | null };
  const tasks = allTasksData as unknown as TaskRow[];

  const updates = new Map<string, { week_start: string; week_end: string }>();
  updates.set(taskId, { week_start: newStart, week_end: newEnd });

  function cascade(id: string) {
    const applied = updates.get(id)!;
    const successors = tasks.filter((t) => t.predecessor_id === id);
    for (const succ of successors) {
      if (updates.has(succ.id)) continue; // 循環は書き込み時点で防止済みだが念のため多重処理を避ける
      const succStart = succ.week_start;
      const succEnd = succ.week_end;
      if (!succStart || !succEnd) continue;
      if (applied.week_end >= succStart) {
        const requiredStart = addDaysIso(applied.week_end, 1);
        const delta = dayDiffIso(succStart, requiredStart);
        updates.set(succ.id, { week_start: requiredStart, week_end: addDaysIso(succEnd, delta) });
        cascade(succ.id);
      }
    }
  }
  cascade(taskId);

  for (const [id, values] of updates) {
    const { error } = await supabase.from("progress_tasks").update(values).eq("id", id);
    if (error) throw new UserFacingError(errorMessage(error));
  }
  revalidatePath(`/projects/${projectId}/chapters/15`);
}
