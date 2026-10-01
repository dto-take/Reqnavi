-- google_login.md 前提確認：既存のhandle_new_user（Phase0由来、20260805005823）は、
-- Googleでサインアップしたユーザーであればメールドメインを問わず無条件にuser_profiles
-- （member・自社company）を作成していた。これは本指示書が要求するドメイン判定
-- （自社ドメイン以外は/admin/usersでの事前登録が無ければ拒否する）と矛盾し、
-- 「無条件にプロフィールを作成する仕組みを残したまま新しいロジックを追加しない」
-- （やってはいけないこと）に反するため、判定をアプリケーションコード側
-- （/auth/callback、src/lib/auth/oauth-signup.ts）へ完全に移し、このトリガー・関数を削除する。
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
