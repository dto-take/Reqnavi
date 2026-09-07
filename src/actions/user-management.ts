"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";

// "use server"ファイルは非同期関数以外をexportできないため、この配列・型はここに閉じ、
// 画面側（admin/users/page.tsx）は同じ6ロールをローカルに持つ（役割一覧程度の小さな重複は許容する）。
const VALID_ROLES = ["admin", "exec", "pmo", "pm", "member", "partner"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

async function assertAdmin(supabase: Awaited<ReturnType<typeof createServerActionClient>>) {
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") throw new UserFacingError("管理者のみ実行できます");
  return claims;
}

export type UserProfileSummary = {
  user_id: string;
  user_role: string;
  auth_provider: string;
  force_password_reset: boolean;
  companies: { name: string } | null;
};

export type AdminUserRow = {
  id: string;
  email: string | undefined;
  profile: UserProfileSummary | null;
};

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const supabase = await createServerActionClient();
  await assertAdmin(supabase);

  const admin = createAdminClient();
  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers();
  if (authError) throw authError;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, user_role, auth_provider, force_password_reset, companies(name)");
  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles as unknown as UserProfileSummary[]).map((p) => [p.user_id, p])
  );

  return authUsers.users.map((u) => ({
    id: u.id,
    email: u.email,
    profile: profileMap.get(u.id) ?? null,
  }));
}

export async function updateUserRole(userId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const claims = await assertAdmin(supabase);

  // 自分自身のロールをこの画面から変更できないようにする（うっかりmemberに変更して
  // admin権限を失うロックアウトを防ぐ。CLAUDE.md規約に基づく防御的ガード）。
  if (claims?.claims?.sub === userId) {
    throw new UserFacingError("自分自身のロールはこの画面から変更できません");
  }

  const newRole = formData.get("user_role") as string;
  if (!VALID_ROLES.includes(newRole as ValidRole)) {
    throw new UserFacingError(`不正なロールです: ${newRole}`);
  }

  const { error } = await supabase
    .from("user_profiles")
    .update({ user_role: newRole })
    .eq("user_id", userId);
  if (error) throw error;
  revalidatePath("/admin/users");
}

// admin-users.tsのcreatePartnerAccountを一般化したもの（これまでpartner限定だった
// アカウント作成機能を全ロールに拡張する）。user_roleにadminを選べる点は意図的（規約39の
// トリガーはUPDATE時のみの保護であり、この新規作成の唯一の防衛線はassertAdminである。
// このガードは絶対に外さない）。
// generateDraft等と同じuseActionState対応パターン（規約50）。createPartnerAccountと同様、
// throw+error.tsxだと具体的なエラー文言が汎用文言に潰れるため、戻り値のerrorで判定する。
export async function createUserAccount(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();
    await assertAdmin(supabase);
    const tenantId = await getTenantId(supabase);
    if (!tenantId) throw new UserFacingError("認証が必要です");

    const email = formData.get("email") as string;
    const tempPassword = formData.get("temp_password") as string;
    const userRole = formData.get("user_role") as string;
    if (!VALID_ROLES.includes(userRole as ValidRole)) {
      throw new UserFacingError(`不正なロールです: ${userRole}`);
    }
    const companyName = formData.get("company_name") as string;

    const admin = createAdminClient();
    const companyType = userRole === "partner" ? "partner" : "own";

    // 会社名だけでなく種別（own/partner）も一致するものを探す。種別を見ずに名前だけで
    // 検索すると、同名だが種別が異なる会社（例：自社と同名のパートナー会社）を誤って
    // 引き当ててしまう可能性がある（companies.nameに一意制約は無い）。
    const { data: existingCompany } = await admin
      .from("companies")
      .select("id")
      .eq("name", companyName)
      .eq("company_type", companyType)
      .maybeSingle();

    let companyId = existingCompany?.id;
    if (!companyId) {
      const { data: newCompany, error: companyError } = await admin
        .from("companies")
        .insert({ name: companyName, company_type: companyType })
        .select("id")
        .single();
      if (companyError || !newCompany) throw companyError ?? new UserFacingError("会社の作成に失敗しました");
      companyId = newCompany.id;
    }

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError ?? new UserFacingError("アカウント作成に失敗しました");

    const { error: profileError } = await admin.from("user_profiles").insert({
      user_id: authUser.user.id,
      tenant_id: tenantId,
      user_role: userRole,
      company_id: companyId,
      auth_provider: "email",
      force_password_reset: true,
    });
    if (profileError) throw profileError;

    revalidatePath("/admin/users");
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
