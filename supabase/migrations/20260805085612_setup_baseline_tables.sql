-- baseline_snapshots/baseline_item_snapshotsはinit_schema.sqlで作成済み・RLSも有効化済みだが、
-- ポリシー・GRANTが1件も無い状態だった（progress_tasks・Phase2 Step7と同種、規約23で要確認）。
-- create table if not exists の本体は既存テーブルには適用されないため、不足分を個別に補う。

create table if not exists baseline_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id),
  tenant_id     uuid not null,
  version_no    text not null,
  status        text not null default 'active',
  approved_by   uuid references user_profiles(user_id),
  approval_note text,
  readiness_snapshot jsonb,
  created_at    timestamptz default now()
);

create table if not exists baseline_item_snapshots (
  id            uuid primary key default gen_random_uuid(),
  baseline_id   uuid references baseline_snapshots(id) on delete cascade,
  item_id       uuid not null,
  chapter_no    int,
  template_type text,
  content       jsonb,
  status_at_baseline text
);

-- 実データ0件を確認済みのため、tenant_idはnullable追加ではなくNOT NULLで確定させる
-- （Phase2 Step7のprogress_tasksと同じ理由。他の全テーブルのtenant_idと一貫させる）
alter table baseline_snapshots add column if not exists tenant_id uuid;
alter table baseline_snapshots alter column tenant_id set not null;

alter table baseline_snapshots enable row level security;
alter table baseline_item_snapshots enable row level security;

grant select, insert, update, delete on baseline_snapshots to authenticated;
grant select, insert, update, delete on baseline_item_snapshots to authenticated;

create policy "baseline_snapshots_select" on baseline_snapshots for select using (is_project_member(project_id));
create policy "baseline_snapshots_insert" on baseline_snapshots for insert with check (
  (auth.jwt() ->> 'user_role') in ('admin','pm') and is_project_member(project_id)
);
create policy "baseline_snapshots_update" on baseline_snapshots for update using (
  (auth.jwt() ->> 'user_role') in ('admin','pm') and is_project_member(project_id)
);

-- baseline_item_snapshotsはproject_idを直接持たないため、baseline_snapshots経由で判定する（規約21）
create policy "baseline_item_snapshots_select" on baseline_item_snapshots for select using (
  baseline_id in (select id from baseline_snapshots where is_project_member(project_id))
);
create policy "baseline_item_snapshots_insert" on baseline_item_snapshots for insert with check (
  baseline_id in (select id from baseline_snapshots where is_project_member(project_id))
);
