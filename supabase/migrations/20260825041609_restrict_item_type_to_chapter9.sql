-- 「種別」列（item_type）は9章（機能要件）専用の列だったが、テンプレートCの共通列として
-- 全章（1・2・3・6・8・9・12章）に表示されてしまっていたため、9章限定に修正する。
-- 既存データ（content.item_type）は変更しない。列の表示・非表示のみを制御する。
update chapter_column_templates
set applicable_chapters = array[9]
where column_key = 'item_type';
