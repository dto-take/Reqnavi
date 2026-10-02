-- screen_flow_ux_phase1.md Step1：画面遷移図（flow_type='screen_transition'）のデータモデル拡張。
-- pos_x/pos_yは既存（integer、業務フロー等で使用中）のためそのまま流用する。
-- screen_idは業務フロービルダー用の既存列のため、画面ID（S-01形式）は別列screen_codeにする。

alter table flow_nodes
  add column if not exists function_item_id uuid references requirement_items(id) on delete set null,
  add column if not exists screen_code text,
  add column if not exists status text not null default 'se_reviewing'
    check (status in ('ai_draft', 'se_reviewing', 'confirmed'));

-- 1つの9章項目は1ノードにのみ紐付く（画面遷移図のノードに限定）
create unique index if not exists flow_nodes_screen_function_unique
  on flow_nodes (project_id, function_item_id)
  where function_item_id is not null and flow_type = 'screen_transition';

-- flow_edges：既存データの重複を1件に統合してから一意制約を張る。
-- 統合時は操作名（label）が入っている行を優先して残す。
delete from flow_edges e
using (
  select id,
         row_number() over (
           partition by from_node, to_node
           order by (coalesce(label, '') = ''), id
         ) as rn
  from flow_edges
) d
where e.id = d.id and d.rn > 1;

alter table flow_edges
  add constraint flow_edges_from_to_unique unique (from_node, to_node);

-- 自己ループ禁止。画面遷移図の既存自己ループは削除する。他のflow_typeの既存データには
-- 触れないよう、既存行は検証せず（not valid）新規・更新行のみ制約対象とする。
delete from flow_edges e
using flow_nodes n
where e.from_node = e.to_node and n.id = e.from_node and n.flow_type = 'screen_transition';

alter table flow_edges
  add constraint flow_edges_no_self_loop check (from_node <> to_node) not valid;

-- 操作名の編集に必要なUPDATEポリシー（これまでUPDATEポリシーが無く、UPDATEは
-- エラー無しで0件更新になる。規約47）。from_node/to_nodeの両方の所属を確認する（規約29）。
create policy "flow_edges_update" on flow_edges
  for update
  using (from_node in (select id from flow_nodes where is_project_member(project_id)))
  with check (
    from_node in (select id from flow_nodes where is_project_member(project_id))
    and to_node in (select id from flow_nodes where is_project_member(project_id))
  );

-- 既存データの移行（画面遷移図のノードのみ）
-- 1. 画面ID・座標：order_index順に S-01, S-02… と格子状（横270px・縦120px間隔、4列）に配置
with ranked as (
  select id, row_number() over (partition by project_id order by order_index, id) as rn
  from flow_nodes
  where flow_type = 'screen_transition'
)
update flow_nodes n
set screen_code = 'S-' || lpad(r.rn::text, 2, '0'),
    pos_x = 40 + ((r.rn - 1) % 4) * 270,
    pos_y = least(30 + ((r.rn - 1) / 4) * 120, 660 - 72)
from ranked r
where n.id = r.id;

-- 2. 9章項目への自動紐付け：ノード名と9章の画面情報を持つ項目のcontent.nameが完全一致し、
--    かつ双方とも同名が複数存在しない（一意に対応する）場合のみ紐付ける。
--    一意に対応しないものは推測せず未紐付けのまま残す。
with node_cand as (
  select id, project_id, label,
         count(*) over (partition by project_id, label) as node_cnt
  from flow_nodes
  where flow_type = 'screen_transition'
),
item_all as (
  select id, project_id, content ->> 'name' as name,
         coalesce(trim(content ->> 'screen_fields'), '') <> '' as has_screen,
         count(*) over (partition by project_id, content ->> 'name') as item_cnt
  from requirement_items
  where chapter_no = 9 and status <> 'rejected'
),
pairs as (
  select nc.id as node_id, ia.id as item_id
  from node_cand nc
  join item_all ia on ia.project_id = nc.project_id and ia.name = nc.label
  where nc.node_cnt = 1 and ia.item_cnt = 1 and ia.has_screen
)
update flow_nodes n
set function_item_id = p.item_id
from pairs p
where n.id = p.node_id;
