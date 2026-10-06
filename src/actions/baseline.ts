"use server";

import { safeFormAction, type FormActionState } from "@/lib/action-result";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getReadinessSummary } from "@/actions/readiness";
import { UserFacingError } from "@/lib/user-error";
import { loadAuditProject, recordAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";

export type ActiveBaseline = {
  id: string;
  version_no: string;
  approval_note: string | null;
  created_at: string;
  readiness_snapshot: unknown;
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

// useActionStateの形（失敗は戻り値のerrorでフォーム内に表示する。本番ビルドではthrowの文言が消えるため）
export async function createBaseline(projectId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  return safeFormAction("createBaseline", () => createBaselineInner(projectId, formData));
}

async function createBaselineInner(projectId: string, formData: FormData): Promise<void> {
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
  const versionNo = `v1.${count ?? 0}`;

  // 旧activeのsuperseded化・新ベースラインの作成・項目スナップショットの作成を、DB関数（1トランザクション）で行う。
  // 項目の行はアプリに通さない（PostgRESTの1000行上限で黙って切り捨てられるため。規約62）。
  // 関数内でスナップショット件数が元の件数と一致することを確認し、不一致なら全体をロールバックする。
  const { data: baselineId, error } = await supabase.rpc("create_baseline_snapshot", {
    p_project_id: projectId,
    p_version_no: versionNo,
    p_approval_note: approvalNote,
    p_readiness: readinessSnapshot,
    p_tenant_id: tenantId,
    p_approved_by: userData.user.id,
  });
  if (error) throw new UserFacingError(errorMessage(error));

  const { count: snapshotCount } = await supabase
    .from("baseline_item_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("baseline_id", baselineId as string);
  await recordAudit({
    action: "baseline.confirm",
    project: await loadAuditProject(supabase, projectId),
    target: { type: "baseline", id: (baselineId as string | null) ?? null, label: versionNo },
    details: { version: versionNo, item_count: snapshotCount ?? null },
  });

  revalidatePath(`/projects/${projectId}/baseline`);
}
