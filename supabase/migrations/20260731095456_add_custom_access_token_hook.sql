-- custom-access-token-hook: JWTに tenant_id / user_role / company_id を付与する。
-- クレーム名は必ず user_role（role は Supabase 予約語と衝突するため使わない。CLAUDE.md参照）。
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  profile record;
begin
  select tenant_id, user_role, company_id
    into profile
    from public.user_profiles
    where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- プロファイル未登録のユーザーはログイン自体は通すが、権限系クレームは付与しない
  -- (RLSにより実質すべてのデータアクセスが拒否される安全側の挙動)
  if profile is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(profile.tenant_id));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(profile.user_role));
    claims := jsonb_set(claims, '{company_id}', to_jsonb(profile.company_id));
  end if;

  event := jsonb_set(event, '{claims}', claims);

  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

grant select
  on table public.user_profiles
  to supabase_auth_admin;

create policy "auth_admin_read_user_profiles" on public.user_profiles
  as permissive for select
  to supabase_auth_admin
  using (true);
