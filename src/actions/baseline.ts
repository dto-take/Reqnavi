"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getReadinessSummary } from "@/actions/readiness";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

export type ActiveBaseline = {
  id: string;
  version_no: string;
  approval_note: string | null;
  created_at: string;
  readiness_snapshot: unknown;
};

type RequirementItemRow = {
  id: string;
  chapter_no: number;
  template_type: string;
  content: Record<string, string>;
  status: string;
};

export async function getActiveBaseline(projectId: string): Promise<ActiveBaseline | null> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("baseline_snapshots")
    .select("id, version_no, approval_note, created_at, readiness_snapshot")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ActiveBaseline | null;
}

export async function createBaseline(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new UserFacingError("PM以上の権限が必要です");
  }
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new UserFacingError("認証が必要です");

  const approvalNote = formData.get("approval_note") as string;
  const readinessSnapshot = await getReadinessSummary(projectId);

  const { count } = await supabase
    .from("baseline_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  await supabase
    .from("baseline_snapshots")
    .update({ status: "superseded" })
    .eq("project_id", projectId)
    .eq("status", "active");

  const versionNo = `v1.${count ?? 0}`;

  const { data: baselineData, error: baselineError } = await supabase
    .from("baseline_snapshots")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      version_no: versionNo,
      status: "active",
      approved_by: userData.user.id,
      approval_note: approvalNote,
      readiness_snapshot: readinessSnapshot,
    })
    .select("id")
    .single();
  if (baselineError || !baselineData) throw baselineError ?? new Error("ベースライン作成に失敗しました");
  const baseline = baselineData as unknown as { id: string };

  const { data: itemsData, error: itemsError } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, template_type, content, status")
    .eq("project_id", projectId);
  if (itemsError) throw itemsError;
  const items = itemsData as unknown as RequirementItemRow[];

  if (items && items.length > 0) {
    const snapshotRows = items.map((item) => ({
      baseline_id: baseline.id,
      item_id: item.id,
      chapter_no: item.chapter_no,
      template_type: item.template_type,
      content: item.content,
      status_at_baseline: item.status,
    }));
    const { error: snapshotError } = await supabase.from("baseline_item_snapshots").insert(snapshotRows);
    if (snapshotError) throw snapshotError;
  }

  revalidatePath(`/projects/${projectId}/baseline`);
}
