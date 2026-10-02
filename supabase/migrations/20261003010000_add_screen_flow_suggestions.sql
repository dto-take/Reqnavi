-- screen_flow_ux_phase3.md Step1：画面遷移図のAI素案（差分提案）を保存する専用テーブル。
-- 提案はキャンバス上に破線で描画され、ページを離れても残り、見送った提案は再提案されない
-- ため、KPI・非機能要件の候補（一時的な状態）と違いDBに保存する。flow_nodes/flow_edgesに
-- 「提案中」の行を混ぜる方式は、警告・確定件数・出力等で提案行の除外漏れが起きやすいため取らない。
create table screen_flow_suggestions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade, -- 案件削除で提案も消える（規約48）
  tenant_id  uuid,                                                    -- flow_nodesと同じくnull可
  kind       text not null check (kind in ('node', 'transition')),
  payload    jsonb not null,
  why        text not null,
  state      text not null default 'open' check (state in ('open', 'adopted', 'rejected')),
  result_id  uuid,                                                    -- 採用で作られた実ノード/実遷移のid
  created_at timestamptz not null default now()
);

create index screen_flow_suggestions_project_state_idx on screen_flow_suggestions (project_id, state);

alter table screen_flow_suggestions enable row level security;

create policy "screen_flow_suggestions_select" on screen_flow_suggestions
  for select using (is_project_member(project_id));
create policy "screen_flow_suggestions_insert" on screen_flow_suggestions
  for insert with check (is_project_member(project_id));
create policy "screen_flow_suggestions_update" on screen_flow_suggestions
  for update using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy "screen_flow_suggestions_delete" on screen_flow_suggestions
  for delete using (is_project_member(project_id));

grant select, insert, update, delete on screen_flow_suggestions to authenticated;
grant select, insert, update, delete on screen_flow_suggestions to service_role;
