update prompts set is_active = false where purpose = 'classify_document' and is_active = true;

insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v' || (regexp_replace(version, '^v', '')::int + 1),
  replace(prompt_body, 'お客様概要, プロジェクトの目的, ロードマップ,', 'お客様概要, プロジェクトの目的, ロードマップ, KPI,'),
  true
from prompts
where purpose = 'classify_document' and is_active = false
order by created_at desc
limit 1;
