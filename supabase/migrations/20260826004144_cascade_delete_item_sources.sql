-- deleteRequirementItem（要件項目の削除機能）で、AI素案生成時に出典として自動的に
-- item_sourcesが紐付けられているほぼ全ての項目が「23503: item_sourcesから参照されている」
-- という外部キー制約違反で削除できなかった（実機で再現・確認済み）。
-- item_sourcesは「どの資料が出典か」を示すだけの紐付けテーブルで、元の項目が消えれば
-- 存在価値も無くなるため、ON DELETE CASCADEに変更する。
-- （change_requests等、他にも requirement_items を参照するテーブルがあるが、
-- そちらは業務記録のため今回は対象外とする）
alter table item_sources drop constraint item_sources_item_id_fkey;
alter table item_sources add constraint item_sources_item_id_fkey
  foreign key (item_id) references requirement_items(id) on delete cascade;
