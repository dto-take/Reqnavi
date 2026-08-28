import { createClient } from "@supabase/supabase-js";

// このクライアントはサーバー側の管理者専用操作でのみ使用する。
// 呼び出し元で必ずuser_role==='admin'等の権限チェックを行ってから使うこと。
// クライアントバンドルに含めない（"use server"ファイルからのみimportする）。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
