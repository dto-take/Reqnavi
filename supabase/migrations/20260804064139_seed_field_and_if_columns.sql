insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('C', 'field_definitions', '項目定義（例：顧客名:text:必須, 電話番号:text:任意）', 'text', 9),
  ('C', 'external_if',       '外部IF定義（連携先・データ項目・タイミング）', 'text', 10)
on conflict (template_type, column_key) do nothing;
