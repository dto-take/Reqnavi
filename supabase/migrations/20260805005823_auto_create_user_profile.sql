-- Googleでサインアップした自社メンバーのuser_profilesを初回ログイン時に自動作成する。
-- search_path=''+スキーマ完全修飾は custom_access_token_hook と同じ理由（search_path hijacking対策）。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Googleでサインアップしたユーザーのみ自動作成する。
  -- パートナー（メール/パスワード）はcreatePartnerAccount（管理者操作）で明示的に作成するため対象外
  if new.raw_app_meta_data->>'provider' = 'google' then
    insert into public.user_profiles (user_id, tenant_id, user_role, company_id, auth_provider)
    values (
      new.id,
      '00000000-0000-0000-0000-000000000000', -- 固定tenant_id（単一テナント運用、02_architecture.md参照）
      'member',                                 -- 安全側のデフォルト。昇格は管理者が別途行う
      '00000000-0000-0000-0000-000000000001',  -- seed_own_companyで保証した自社company_id
      'google'
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
