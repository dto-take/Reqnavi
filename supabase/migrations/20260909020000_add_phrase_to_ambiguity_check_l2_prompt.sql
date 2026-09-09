-- フェーズ5：曖昧表現のインライン表示のため、AI判定（ambiguity_check_l2）にも該当箇所の
-- 文字列（phrase）を返させる。既存バージョン管理方針（既存行を書き換えず新バージョンを追加、
-- 旧バージョンを非アクティブ化）に従う。
-- phraseは対象フィールドの値からの完全一致する部分文字列である必要がある（本文中で
-- text.indexOf(phrase)により該当箇所を検索してハイライトするため。要約・言い換えは不可）。

update prompts set is_active = false where purpose = 'ambiguity_check_l2' and is_active = true;

insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v' || (regexp_replace(version, '^v', '')::int + 1),
  '以下の要件項目について、"具体的な判断基準（数値・条件・担当者名など）が欠けている"表現がないか判定してください。

判定対象が本当に曖昧か迷う場合は ambiguous: false としてください
（過剰検知よりも見落としが少ない方を優先し、最終判断はSEが行います）。

ambiguousがtrueの場合、phraseには該当箇所の文字列を、対象フィールドの値から
一字一句そのまま抜き出して返してください（要約・言い換え・大意ではなく、
元の文字列の完全な部分文字列であること。本文中でこの文字列を検索してハイライト表示するため）。
該当箇所を1つの連続した文字列として特定できない場合はphraseをnullにしてください。

出力は以下のJSON形式のみとし、説明文・コードブロック記号は一切含めないこと。
{"ambiguous": boolean, "field": "対象フィールドキー", "reason": string | null, "phrase": string | null}

【要件項目】
{item_content}',
  true
from prompts
where purpose = 'ambiguity_check_l2' and is_active = false
order by created_at desc
limit 1;
