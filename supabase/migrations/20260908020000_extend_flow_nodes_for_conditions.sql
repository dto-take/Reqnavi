alter table flow_nodes
  add column if not exists node_type text not null default 'task'
    check (node_type in ('start', 'task', 'approval', 'condition', 'notify', 'action', 'end')),
  add column if not exists mode text default '手動' check (mode in ('手動', '自動')),
  add column if not exists screen_id text,
  add column if not exists sys_kind text check (sys_kind in ('社内システム', '外部連携', 'システム外（手作業）')),
  add column if not exists input_data text,
  add column if not exists output_data text,
  add column if not exists business_rule text,
  add column if not exists channel text,
  add column if not exists condition_logic text check (condition_logic in ('all', 'any')),
  add column if not exists condition_rules jsonb default '[]'::jsonb,
  add column if not exists branch text not null default 'main' check (branch in ('main', 'yes', 'no')),
  add column if not exists parent_condition_id uuid references flow_nodes(id) on delete cascade;

-- 業務フロービルダー（条件分岐対応の新規機能）専用のflow_type。既存のbusiness_asis/business_tobeは
-- order_indexのみに基づく単純な直線チェーン＋regenerateEdges()前提の別実装のままとし、本機能とは
-- 混在させない（ツリー構造とは矛盾するため）。
alter table flow_nodes drop constraint if exists flow_nodes_flow_type_check;
alter table flow_nodes add constraint flow_nodes_flow_type_check
  check (flow_type in ('business_asis', 'business_tobe', 'screen_transition', 'business_builder'));
