-- 1. 全テーブルでRLSを有効化
alter table organizations enable row level security;
alter table companies enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table requirement_items enable row level security;
alter table chapter_column_templates enable row level security;
alter table source_documents enable row level security;
alter table item_sources enable row level security;
alter table item_history enable row level security;
alter table flow_nodes enable row level security;
alter table flow_edges enable row level security;
alter table progress_tasks enable row level security;
alter table baseline_snapshots enable row level security;
alter table baseline_item_snapshots enable row level security;
alter table change_requests enable row level security;
alter table prompts enable row level security;
alter table ai_interactions enable row level security;
alter table ai_reconciliation_suggestions enable row level security;

-- 2. ポリシー本体（02_architecture.md 4章より）
create policy "reqnavi_access" on requirement_items
  for select using (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );

create policy "estimation_impact_partner_block" on change_requests
  for select using (
    (auth.jwt() ->> 'user_role') != 'partner'
    or estimation_impact is null
  );