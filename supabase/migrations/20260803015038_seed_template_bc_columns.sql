-- B. 5W1H型（データ移行要件・システム運用要件・システム定着化支援要件で使用）
-- how/how_mount はデータ移行要件のみで使う列。他章では空欄のままでよい（列自体は共通）
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('B', 'what',      '何を',   'text', 1),
  ('B', 'who',       '誰が',   'text', 2),
  ('B', 'when',      'いつ',   'text', 3),
  ('B', 'where',     '何処で', 'text', 4),
  ('B', 'why',       'なぜ',   'text', 5),
  ('B', 'how',       'どのように（データ移行要件のみ使用）', 'text', 6),
  ('B', 'how_much',  'どのくらい（データ移行要件のみ使用）', 'text', 7)
on conflict (template_type, column_key) do nothing;

-- C. 項目一覧型（開発スコープ・業務要件・機能要件・トレーニング要件の対象一覧で使用）
-- platform_feature は機能要件のみで使う列。他章では空欄のままでよい
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('C', 'category',        '区分・分類', 'text', 1),
  ('C', 'name',             '名称',       'text', 2),
  ('C', 'detail',           '内容',       'text', 3),
  ('C', 'item_type',        '種別',       'text', 4),
  ('C', 'platform_feature', '対応機能（SFDC機能・機能要件のみ使用）', 'text', 5)
on conflict (template_type, column_key) do nothing;
