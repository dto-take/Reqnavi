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

create table requirement_items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id),
  tenant_id       uuid not null,
  chapter_no      int  not null,              -- 1〜15
  template_type   text not null,               -- 'A'|'B'|'C'|'D'|'E'
  parent_id       uuid references requirement_items(id), -- D.階層ツリー型のみ使用
  order_index     int  not null default 0,
  content         jsonb not null default '{}', -- テンプレート別の中身
  status          text not null default 'ai_draft', -- ai_draft/se_reviewing/confirmed/exception_approved
  ambiguous_flags jsonb default '[]',
  exception_reason text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table chapter_column_templates (
  template_type text not null,
  column_key    text not null,
  label         text not null,
  data_type     text not null, -- text/select/number/date
  order_index   int not null,
  primary key (template_type, column_key)
);

create table source_documents (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id),
  file_name       text not null,
  storage_path    text not null,
  classified_tags jsonb default '[]'
);

create table item_sources (
  item_id  uuid references requirement_items(id),
  source_id uuid references source_documents(id),
  location_note text,
  primary key (item_id, source_id)
);

create table item_history (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid references requirement_items(id),
  changed_by   uuid references auth.users(id),
  changed_at   timestamptz default now(),
  before_status text,
  after_status  text,
  input_mode    text -- 'direct_input'|'minutes_import'
);

create table flow_nodes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  flow_type  text not null, -- 'business_asis'|'business_tobe'|'screen_transition'
  label      text not null,
  role_lane  text,
  pos_x int, pos_y int
);

create table flow_edges (
  id        uuid primary key default gen_random_uuid(),
  from_node uuid references flow_nodes(id),
  to_node   uuid references flow_nodes(id),
  label     text
);

create table progress_tasks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id),
  task_name        text not null,
  owner_primary    text, owner_secondary text,
  week_start date, week_end date,
  percent_complete int default 0
);

create table baseline_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id),
  version_no    text not null,
  status        text not null default 'active', -- active | superseded
  approved_by   uuid references auth.users(id),
  approval_note text,
  readiness_snapshot jsonb,
  created_at    timestamptz default now()
);

create table baseline_item_snapshots (
  id            uuid primary key default gen_random_uuid(),
  baseline_id   uuid references baseline_snapshots(id),
  item_id       uuid not null,
  chapter_no    int,
  template_type text,
  content       jsonb,
  status_at_baseline text
);

create table change_requests (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id),
  baseline_id    uuid references baseline_snapshots(id),
  item_id        uuid references requirement_items(id),
  change_type    text, -- added/modified/deleted
  before_content jsonb,
  after_content  jsonb,
  reason         text,
  estimation_impact text, -- ※パートナーには不可視
  raised_by      uuid references auth.users(id),
  status         text default 'open',
  raised_at      timestamptz default now()
);

create table prompts (
  id            uuid primary key default gen_random_uuid(),
  purpose       text not null,      -- extract_template_b / ambiguity_check_l2 / conflict_check 等
  template_type text,
  version       text not null,
  prompt_body   text not null,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create table ai_interactions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id),
  prompt_id   uuid references prompts(id),
  input_summary jsonb,
  output       jsonb,
  created_at  timestamptz default now()
);

create table ai_reconciliation_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  triggered_by_item_id uuid references requirement_items(id),
  target_item_id       uuid references requirement_items(id),
  suggested_content     jsonb,
  reason                text,
  status                text default 'pending', -- pending/accepted/rejected
  created_at            timestamptz default now()
);