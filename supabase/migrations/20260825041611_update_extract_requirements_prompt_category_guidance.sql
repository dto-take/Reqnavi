-- AI抽出プロンプト（extract_requirements）の「区分・分類」フィールドが、
-- 章名（例：「お客様概要」）をそのまま値にしてしまい実質的に意味を持たない問題を修正する。
-- 既存バージョン管理方針（既存行を書き換えず新バージョンを追加、旧バージョンを非アクティブ化）に従う。

update prompts set is_active = false where purpose = 'extract_requirements' and is_active = true;

insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v' || (regexp_replace(version, '^v', '')::int + 1),
  prompt_body || '

【区分・分類（category）フィールドについて】
章の名称（例：「お客様概要」「業務要件」等）をそのまま区分・分類の値として使わないこと。
資料の内容に応じた、より具体的な区分を付けること。
（例：「お客様概要」章であれば「会社情報」「経営課題」「組織体制」等、
「業務要件」章であれば実際の業務領域名等、章名より一段具体的な区分にする）',
  true
from prompts
where purpose = 'extract_requirements' and is_active = false
order by created_at desc
limit 1;
