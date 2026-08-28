alter table chapter_column_templates add column if not exists width_hint text default 'normal' check (width_hint in ('normal', 'wide'));

-- 文字数が多くなりやすい列を「wide」に設定
update chapter_column_templates
set width_hint = 'wide'
where column_key in ('detail', 'issue', 'solution', 'pros_cons', 'why', 'overview', 'external_if', 'field_definitions');
