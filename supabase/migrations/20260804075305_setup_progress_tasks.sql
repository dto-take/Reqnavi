-- progress_tasksはinit_schema.sqlで作成済み・RLSはenable_rls.sqlで有効化済みだが、
-- tenant_id列・NOT NULL制約・CHECK制約・ポリシー・GRANTが一切無い状態だった（規約23で要確認とされていた通り。
-- 実際に確認したところ現状0件のためデータ移行の心配は無いが、`create table if not exists`の本体は
-- 既存テーブルには一切適用されないため、指示書の意図（列・制約・RLS・GRANT）を個別に補う。

alter table progress_tasks add column if not exists tenant_id uuid;
update progress_tasks pt set tenant_id = p.tenant_id
  from projects p where p.id = pt.project_id and pt.tenant_id is null;
alter table progress_tasks alter column tenant_id set not null;

alter table progress_tasks alter column week_start set not null;
alter table progress_tasks alter column week_end set not null;
alter table progress_tasks alter column percent_complete set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'progress_tasks_percent_complete_check') then
    alter table progress_tasks add constraint progress_tasks_percent_complete_check
      check (percent_complete between 0 and 100);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'valid_task_range') then
    alter table progress_tasks add constraint valid_task_range
      check (week_end >= week_start);
  end if;
end $$;

alter table progress_tasks enable row level security;
grant select, insert, update, delete on progress_tasks to authenticated;

create policy "progress_tasks_select" on progress_tasks for select using (is_project_member(project_id));
create policy "progress_tasks_insert" on progress_tasks for insert with check (is_project_member(project_id));
create policy "progress_tasks_update" on progress_tasks for update using (is_project_member(project_id));
create policy "progress_tasks_delete" on progress_tasks for delete using (is_project_member(project_id));
