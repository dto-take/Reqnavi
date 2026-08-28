create table effort_logs (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id),
  tenant_id      uuid not null,
  recorded_by    uuid references user_profiles(user_id),
  work_start_date date not null,
  work_end_date   date not null,
  hours_spent     numeric(6,2) not null check (hours_spent > 0),
  note            text,
  created_at      timestamptz default now(),
  constraint valid_date_range check (work_end_date >= work_start_date)
);

alter table effort_logs enable row level security;

-- CLAUDE.md規約12のチェックリストに従い、RLS・GRANTをセットで作成する
grant select, insert, update, delete on effort_logs to authenticated;

create policy "effort_logs_select" on effort_logs
  for select using (is_project_member(project_id));

create policy "effort_logs_insert" on effort_logs
  for insert with check (is_project_member(project_id));

-- 記録した本人のみ編集・削除可（他人の入力を誤って書き換えないようにする）
create policy "effort_logs_update" on effort_logs
  for update using (recorded_by = auth.uid());

create policy "effort_logs_delete" on effort_logs
  for delete using (recorded_by = auth.uid());
