"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { loadAuditProject, recordAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/error-message";
import { safeAction, type ActionResult } from "@/lib/action-result";
import { canRemoveProjectMember } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

// 案件メンバーを外す。引数は案件idと、外すメンバーのuser_id（project_membersにidの列が無いため）。
// 順序：①自分が案件のメンバーであることと権限 ②外す相手が、この案件のメンバーであること
// ③「全体の役割がpmまたはadminのメンバーが、最低1人残る」ガード ④削除（件数確認）。
// 権限・存在の確認を先に行い、そのあとでガードを判定する（RLSで絞られた読み取りの件数だけで判定しない。規約47）。
// 外したメンバーが作成・編集した項目、工数記録は削除しない（project_membersに従属するデータは無い）。
export async function removeProjectMember(projectId: string, userId: string): Promise<ActionResult<{ self: boolean }>> {
  return safeAction("removeProjectMember", () => removeProjectMemberInner(projectId, userId));
}

type MemberRow = { user_id: string; user_profiles: { user_role: string; display_name: string | null } | null };

async function removeProjectMemberInner(projectId: string, userId: string): Promise<{ self: boolean }> {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub as string | undefined;
  const role = claims?.claims?.user_role as string | undefined;
  if (!me) throw new UserFacingError("認証が必要です");

  // ① 自分がこの案件のメンバーか（メンバーでなければ、案件の存在も分からない扱い）と、権限
  const { data: mine, error: mineError } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", me)
    .maybeSingle();
  if (mineError) throw new UserFacingError(errorMessage(mineError));
  if (!mine) throw new UserFacingError("対象が見つかりません");
  if (!canRemoveProjectMember(role, true)) throw new UserFacingError("この操作を行う権限がありません");

  // ② 外す相手が、この案件のメンバーであること（存在しない・別の案件のメンバーは「対象が見つかりません」）
  const { data: rows, error: listError } = await supabase
    .from("project_members")
    .select("user_id, user_profiles(user_role, display_name)")
    .eq("project_id", projectId);
  if (listError) throw new UserFacingError(errorMessage(listError));
  const members = (rows ?? []) as unknown as MemberRow[];
  if (!members.some((m) => m.user_id === userId)) throw new UserFacingError("対象が見つかりません");

  // ③ 最低1人のガード：外したあとに、全体の役割がpmまたはadminのメンバーが残ること
  const remainingManagers = members.filter((m) => m.user_id !== userId && ["admin", "pm"].includes(m.user_profiles?.user_role ?? ""));
  if (remainingManagers.length < 1) {
    throw new UserFacingError("この案件には、管理者またはPMのメンバーが最低1人必要です");
  }

  const auditProject = await loadAuditProject(supabase, projectId);

  // ④ 削除。対象は確認済みなので、0件はRLSで書き込みが拒否された（権限が無い）
  const { data: deleted, error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new UserFacingError(errorMessage(error));
  if (!deleted || deleted.length === 0) throw new UserFacingError("この操作を行う権限がありません");

  await recordAudit({
    action: "member.remove",
    project: auditProject,
    target: { type: "member", id: userId, label: members.find((m) => m.user_id === userId)?.user_profiles?.display_name ?? null },
    details: { self_removal: userId === me },
  });

  revalidatePath(`/projects/${projectId}/members`);
  revalidatePath("/projects");
  return { self: userId === me };
}
