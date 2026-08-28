-- 画面を表す機能要件のみで使う列。それ以外の機能要件・他章（6,8,12）では空欄のままでよい
-- （これまでの「章によっては使わない列がある」方針を踏襲、CLAUDE.mdの設計思想と一貫）
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('C', 'screen_pattern', '画面パターン（一覧/詳細/入力フォーム/ダッシュボード）', 'text', 6),
  ('C', 'screen_fields',  '表示項目（カンマ区切り）', 'text', 7),
  ('C', 'screen_actions', '操作（カンマ区切り）', 'text', 8)
on conflict (template_type, column_key) do nothing;
