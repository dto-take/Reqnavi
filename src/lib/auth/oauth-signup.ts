import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// seed_own_company.sql・auto_create_user_profile.sql（既に削除済みのhandle_new_user）が
// 使っていたのと同じ固定値。単一テナント運用のtenant_idと、自社companyのid。
const OWN_TENANT_ID = "00000000-0000-0000-0000-000000000000";
const OWN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

export type OAuthProfileResult =
  | { ok: true }
  | { ok: false; reason: "account_not_registered" | "profile_lookup_failed" | "profile_creation_failed" };

// google_login.md Step4：認証直後（exchangeCodeForSession成功直後）のユーザーについて、
// 1. 既にuser_profilesが存在するか確認する（存在すればそのまま許可。自社ドメインでも
//    2回目以降のログインではここで止まり、重複作成しない＝Step6-2）
// 2. 存在しない場合、メールドメインが自社ドメイン（OWN_COMPANY_EMAIL_DOMAIN）と一致するかを見る
// 3. 一致する場合のみrole:member・自社companyでuser_profilesを自動作成する
// 4. 一致しない場合は拒否する（事前に/admin/usersで作成済みなら手順1で既に許可されている）
//
// ルートハンドラ（src/app/auth/callback/route.ts）から分離しているのは、本物のGoogle OAuth
// 往復を経由しなくてもこの判定ロジック単体を検証できるようにするため（CLAUDE.md規約28：
// Server Actionの動作検証はcurl等のリクエストシミュレーションに頼らず、実データに対して
// 直接実行するスタンドアロンスクリプトを優先する、と同じ考え方）。
//
// admin（service-role）クライアントを使うのは、呼び出し時点のユーザーがまだuser_profiles行を
// 持たずJWTクレーム（tenant_id等）も無い状態のため、通常のクライアントでは自分自身の行の
// 存在確認・作成を行うRLSの土台が無いこと（規約31のブートストラップと同じ理由）による。
export async function resolveOAuthUserProfile(
  admin: AdminClient,
  user: { id: string; email: string | null | undefined },
  ownDomain: string | null | undefined
): Promise<OAuthProfileResult> {
  const { data: existing, error: fetchError } = await admin
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return { ok: false, reason: "profile_lookup_failed" };
  if (existing) return { ok: true };

  const domain = user.email?.split("@")[1]?.toLowerCase();
  if (!ownDomain || !domain || domain !== ownDomain.toLowerCase()) {
    return { ok: false, reason: "account_not_registered" };
  }

  const { error: insertError } = await admin.from("user_profiles").insert({
    user_id: user.id,
    tenant_id: OWN_TENANT_ID,
    user_role: "member",
    company_id: OWN_COMPANY_ID,
    auth_provider: "google",
  });
  if (insertError) return { ok: false, reason: "profile_creation_failed" };
  return { ok: true };
}
