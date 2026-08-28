"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

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
