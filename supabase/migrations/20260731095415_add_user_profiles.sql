create table user_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  tenant_id     uuid not null,
  user_role     text not null check (user_role in ('admin','exec','pmo','pm','member','partner')),
  company_id    uuid references companies(id),
  auth_provider text not null check (auth_provider in ('google','email')),
  force_password_reset boolean not null default false,
  display_name  text,
  created_at    timestamptz default now(),
  constraint partner_no_google check (
    (auth_provider = 'google' and user_role != 'partner') or (auth_provider = 'email')
  )
);

alter table user_profiles enable row level security;

-- 本人のプロファイルのみ参照可(管理者向けポリシーは別途Phase1後半で追加)
create policy "own_profile_read" on user_profiles
  for select using (auth.uid() = user_id);
