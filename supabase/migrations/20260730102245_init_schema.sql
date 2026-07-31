-- 顧客企業（案件の発注元）※companiesとは別概念
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  industry   text,
  created_at timestamptz default now()
);

-- ユーザーの所属会社（自社 or 外注/パートナー会社）※organizationsとは別概念
create table companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  company_type text not null check (company_type in ('own','partner'))
);

create table projects (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  tenant_id      uuid not null, -- 現状は自社固定値。将来のマルチテナント化に備える
  name           text not null,
  allow_cross_project_reference boolean default false,
  created_at     timestamptz default now()
);

create table project_members (
  project_id uuid references projects(id),
  user_id    uuid references auth.users(id),
  primary key (project_id, user_id)
);