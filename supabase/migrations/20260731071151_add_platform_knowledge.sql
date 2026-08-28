create table platform_knowledge_sets (
  id            uuid primary key default gen_random_uuid(),
  platform_name text not null,       -- 'salesforce' 等
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create table platform_feature_mappings (
  id                     uuid primary key default gen_random_uuid(),
  knowledge_set_id       uuid references platform_knowledge_sets(id),
  requirement_pattern    text not null,   -- 例:「商談管理」「承認フロー」
  standard_feature       text,             -- 例:「Opportunity」「Approval Process」
  requires_customization boolean default false,
  notes                  text
);

alter table projects add column platform_knowledge_set_id uuid references platform_knowledge_sets(id);
