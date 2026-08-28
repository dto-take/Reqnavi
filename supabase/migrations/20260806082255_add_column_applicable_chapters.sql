-- NULL = そのtemplate_typeを使う全章に適用（既存の大半の列はこのまま）
alter table chapter_column_templates add column if not exists applicable_chapters int[];

-- 9章（機能要件）専用の列
update chapter_column_templates
set applicable_chapters = array[9]
where column_key in ('platform_feature', 'screen_pattern', 'screen_fields', 'screen_actions', 'field_definitions', 'external_if');

-- 11章（データ移行要件）専用の列
update chapter_column_templates
set applicable_chapters = array[11]
where column_key in ('how', 'how_much');
