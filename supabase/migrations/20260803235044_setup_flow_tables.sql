-- flow_nodes/flow_edgesはPhase0のinit_schema.sqlで既に作成済み（CLAUDE.md規約23に従い、
-- 実行前にDBで存在確認済み）。RLSはenable_rls.sqlで有効化されているが、ポリシー・GRANTは
-- 未設定で、system_used/order_index/tenant_id列も無い状態だった。
create table if not exists flow_nodes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  tenant_id  uuid not null,
  flow_type  text not null check (flow_type in ('business_asis', 'business_tobe', 'screen_transition')),
  label      text not null,
  role_lane  text,
  system_used text,
  order_index int not null default 0,
  pos_x int, pos_y int
);

create table if not exists flow_edges (
  id        uuid primary key default gen_random_uuid(),
  from_node uuid references flow_nodes(id) on delete cascade,
  to_node   uuid references flow_nodes(id) on delete cascade,
  label     text
);

-- 既存テーブルに列が無い場合のための保険（if not existsなので重複実行しても安全）
alter table flow_nodes add column if not exists system_used text;
alter table flow_nodes add column if not exists order_index int not null default 0;
alter table flow_nodes add column if not exists tenant_id uuid;

-- 既存テーブルにはflow_type列にCHECK制約が無かったため追加する（データは0件のため安全）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'flow_nodes_flow_type_check'
  ) then
    alter table flow_nodes add constraint flow_nodes_flow_type_check
      check (flow_type in ('business_asis', 'business_tobe', 'screen_transition'));
  end if;
end $$;

-- 既存テーブルのFKにはon delete cascadeが無かった。deleteFlowStepでノード削除時に
-- 参照中のedgeが残っているとFK違反で削除自体が失敗するため、cascadeを付け直す
-- （drop+addは新規作成時の自動生成名と同じなので、既存・新規どちらでも安全に働く）。
alter table flow_edges drop constraint if exists flow_edges_from_node_fkey;
alter table flow_edges add constraint flow_edges_from_node_fkey
  foreign key (from_node) references flow_nodes(id) on delete cascade;

alter table flow_edges drop constraint if exists flow_edges_to_node_fkey;
alter table flow_edges add constraint flow_edges_to_node_fkey
  foreign key (to_node) references flow_nodes(id) on delete cascade;

alter table flow_nodes enable row level security;
alter table flow_edges enable row level security;

grant select, insert, update, delete on flow_nodes to authenticated;
grant select, insert, update, delete on flow_edges to authenticated;

create policy "flow_nodes_select" on flow_nodes for select using (is_project_member(project_id));
create policy "flow_nodes_insert" on flow_nodes for insert with check (is_project_member(project_id));
create policy "flow_nodes_update" on flow_nodes for update using (is_project_member(project_id));
create policy "flow_nodes_delete" on flow_nodes for delete using (is_project_member(project_id));

-- flow_edgesはproject_idを持たないため、flow_nodes経由で判定する（CLAUDE.md規約21）
create policy "flow_edges_select" on flow_edges for select using (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);
create policy "flow_edges_insert" on flow_edges for insert with check (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);
create policy "flow_edges_delete" on flow_edges for delete using (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);
