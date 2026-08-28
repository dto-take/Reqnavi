import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerActionClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component（middleware無しでのセッション更新書き込み不可）から呼ばれた場合。
            // getUser()等がトークンリフレッシュを試みてsetAllを呼ぶが、Server Componentの
            // レンダリング中はcookieを書き込めない（Server Action/Route Handler限定）ため、
            // ここで無視する。現在のリクエストの認証結果自体には影響しない。
          }
        },
      },
    }
  );
}

type ServerActionClient = Awaited<ReturnType<typeof createServerActionClient>>;

// getSession().session.access_token_claimsはSDKバージョン依存で不安定なため、
// JWTを検証して claims を返す getClaims() を使う（Phase0 Step3の実機検証より）。
export async function getTenantId(supabase: ServerActionClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  const tenantId = data?.claims.tenant_id;
  if (error || typeof tenantId !== "string") return null;
  return tenantId;
}
