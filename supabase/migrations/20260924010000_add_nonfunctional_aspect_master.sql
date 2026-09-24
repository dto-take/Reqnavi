-- nonfunctional_ux_phase1.md Step1：観点マスタテーブル（全案件共通の参照データ）。
-- 既存のchapter_column_templatesと同じ位置づけ（tenant_id/project_idを持たず、
-- 参照は全ユーザーに開放、書き込みはadminのみ）。
create table nonfunctional_aspect_master (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  order_index   int not null,
  default_items jsonb not null default '[]' -- 標準チェック項目の文言（string[]）
);

alter table nonfunctional_aspect_master enable row level security;

grant select, insert, update, delete on nonfunctional_aspect_master to authenticated;

create policy "nonfunctional_aspect_master_select" on nonfunctional_aspect_master
  for select using (auth.uid() is not null);

create policy "nonfunctional_aspect_master_insert" on nonfunctional_aspect_master
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

-- IPA非機能要求グレードの大分類に相当する標準観点＋各数件の標準チェック項目
insert into nonfunctional_aspect_master (name, order_index, default_items) values
  ('可用性', 1, '["目標稼働率を定めていること", "障害時の目標復旧時間（RTO）を定めていること", "目標復旧時点（RPO）を定めていること", "計画停止の頻度と時間帯を定めていること"]'::jsonb),
  ('性能拡張性', 2, '["主要画面の目標応答時間を定めていること", "想定同時アクセス数を定めていること", "将来の利用者数増加に対する拡張方針を定めていること", "データ量の増加見込みを定めていること"]'::jsonb),
  ('運用保守性', 3, '["障害発生時の一次切り分け手順が文書化されていること", "定期メンテナンスの実施枠が定義されていること", "ログの保持期間とアーカイブ方針が定義されていること", "監視対象のメトリクスと通知先が定義されていること"]'::jsonb),
  ('移行性', 4, '["移行対象データの範囲が明確になっていること", "移行時のダウンタイム許容範囲を定めていること", "移行リハーサルの実施を計画していること", "移行失敗時の切り戻し手順を定めていること"]'::jsonb),
  ('セキュリティ', 5, '["アクセス権限の管理方針を定めていること", "通信の暗号化方式を定めていること", "監査ログの取得範囲を定めていること", "脆弱性診断の実施計画を定めていること"]'::jsonb);

-- nonfunctional_ux_phase1.md Step2：既存の10章（非機能要件）行を
-- {category, overview, checklist:[{item,status}]} の1行完結形式から、
-- 観点行（parent_id null／content:{name,policy,master_id}）＋
-- チェック項目行（parent_id=観点行のid／content:{text,judgement,source}）の
-- 親子階層へ移行する。Staging環境に実際にこの形式のテストデータが投入されており
-- （「可用性」が重複している既知バグの実例そのもの）、移行スクリプトが必要と判断した。
--
-- 手順：
-- 1. 同一project_id×同一categoryで複数行ある場合（＝重複バグの実例）は、
--    チェック項目数が多い方（同数ならcreated_atが早い方）を残し、他は削除して1行に統合する
--    （新しいデータモデルは「1案件につき1マスタ観点は最大1行」を前提とするため）。
-- 2. 残った行のcontentを新しい観点シェイプに変換する（categoryをname/overviewをpolicyへ、
--    観点マスタと名称が一致すればmaster_idを設定）。
-- 3. 旧checklist配列の各要素（文言が空でないもの）を、判定値を'済'→'yes'/'対象外'→'no'/
--    それ以外→'unknown'に変換しつつ、子のチェック項目行として展開する。
do $$
declare
  dup record;
  survivor_id uuid;
  row_rec record;
  master_id uuid;
  item jsonb;
  item_order int;
begin
  for dup in
    select project_id, content ->> 'category' as category
    from requirement_items
    where chapter_no = 10 and template_type = 'E' and content ? 'checklist'
    group by project_id, content ->> 'category'
    having count(*) > 1
  loop
    select id into survivor_id
    from requirement_items
    where chapter_no = 10 and template_type = 'E' and content ? 'checklist'
      and project_id = dup.project_id and content ->> 'category' = dup.category
    order by jsonb_array_length(content -> 'checklist') desc, created_at asc
    limit 1;

    delete from requirement_items
    where chapter_no = 10 and template_type = 'E' and content ? 'checklist'
      and project_id = dup.project_id and content ->> 'category' = dup.category
      and id <> survivor_id;
  end loop;

  for row_rec in
    select id, project_id, tenant_id, content
    from requirement_items
    where chapter_no = 10 and template_type = 'E' and content ? 'checklist'
  loop
    select id into master_id from nonfunctional_aspect_master where name = row_rec.content ->> 'category';

    update requirement_items
    set content = jsonb_build_object(
      'name', row_rec.content ->> 'category',
      'policy', coalesce(row_rec.content ->> 'overview', ''),
      'master_id', master_id
    )
    where id = row_rec.id;

    item_order := 0;
    for item in select * from jsonb_array_elements(row_rec.content -> 'checklist')
    loop
      if coalesce(item ->> 'item', '') <> '' then
        insert into requirement_items (project_id, tenant_id, chapter_no, template_type, parent_id, order_index, content, status)
        values (
          row_rec.project_id, row_rec.tenant_id, 10, 'E', row_rec.id, item_order,
          jsonb_build_object(
            'text', item ->> 'item',
            'judgement', case item ->> 'status' when '済' then 'yes' when '対象外' then 'no' else 'unknown' end,
            'source', 'human'
          ),
          'se_reviewing'
        );
        item_order := item_order + 1;
      end if;
    end loop;
  end loop;
end $$;
