import { NextRequest, NextResponse } from "next/server";
import { createServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOAuthUserProfile } from "@/lib/auth/oauth-signup";

// google_login.md Step4：GoogleのOAuth同意後にリダイレクトされてくるコールバック。
// 1. codeパラメータでセッションを確立する
// 2. 確立できたユーザーについて、自社ドメイン自動登録/事前登録済みのみ許可、の判定を
//    src/lib/auth/oauth-signup.tsのresolveOAuthUserProfileへ委譲する
// 3. 拒否された場合はサインアウトし、/loginへエラー付きでリダイレクトする（規約28：
//    Server Actionの失敗はthrowせずredirectで伝える既存のsignInWithPassword等と同じ方式）
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  function loginError(message: string) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }

  if (!code) {
    return loginError("認証コードが見つかりませんでした。もう一度お試しください。");
  }

  const supabase = await createServerActionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return loginError(error?.message ?? "認証に失敗しました。もう一度お試しください。");
  }

  const admin = createAdminClient();
  const result = await resolveOAuthUserProfile(
    admin,
    { id: data.user.id, email: data.user.email },
    process.env.OWN_COMPANY_EMAIL_DOMAIN
  );

  if (!result.ok) {
    await supabase.auth.signOut();
    if (result.reason === "account_not_registered") {
      return NextResponse.redirect(`${origin}/login?error=account_not_registered`);
    }
    return loginError("アカウントの準備に失敗しました。時間を置いて再度お試しください。");
  }

  return NextResponse.redirect(origin);
}
