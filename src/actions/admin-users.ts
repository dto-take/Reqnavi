"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/error-message";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createServerActionClient>>) {
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") {
    throw new Error("管理者のみ実行できます");
  }
}

export async function createPartnerAccount(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();
    await assertAdmin(supabase);
    const tenantId = await getTenantId(supabase);
    if (!tenantId) throw new Error("認証が必要です");

    const email = formData.get("email") as string;
    const tempPassword = formData.get("temp_password") as string;
    const companyName = formData.get("company_name") as string;

    const admin = createAdminClient();

    // 1. パートナー会社が無ければ作成
    const { data: existingCompany } = await admin
      .from("companies")
      .select("id")
      .eq("name", companyName)
      .eq("company_type", "partner")
      .maybeSingle();

    const companyId = existingCompany?.id ?? (
      await admin.from("companies").insert({ name: companyName, company_type: "partner" }).select("id").single()
    ).data?.id;

    // 2. auth.usersにパートナーアカウントを作成（仮パスワード、メール確認済み扱い）
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError ?? new Error("アカウント作成に失敗しました");

    // 3. user_profilesを作成（force_password_reset=trueで初回パスワード変更を強制）
    const { error: profileError } = await admin.from("user_profiles").insert({
      user_id: authUser.user.id,
      tenant_id: tenantId,
      user_role: "partner",
      company_id: companyId,
      auth_provider: "email",
      force_password_reset: true,
    });
    if (profileError) throw profileError;

    revalidatePath("/admin/partners");
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addProjectMemberByEmail(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new UserFacingError("PM以上の権限が必要です");
  }

  const email = formData.get("email") as string;
  const admin = createAdminClient();

  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const targetUser = usersPage.users.find((u) => u.email === email);
  if (!targetUser) throw new UserFacingError("指定されたメールアドレスのユーザーが見つかりません");

  const { error } = await supabase.from("project_members").insert({
    project_id: projectId,
    user_id: targetUser.id,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/members`);
}
