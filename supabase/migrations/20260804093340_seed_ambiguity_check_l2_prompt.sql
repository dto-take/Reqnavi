insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('ambiguity_check_l2', null, 'v1',
'以下の要件項目について、"具体的な判断基準（数値・条件・担当者名など）が欠けている"表現がないか判定してください。

判定対象が本当に曖昧か迷う場合は ambiguous: false としてください
（過剰検知よりも見落としが少ない方を優先し、最終判断はSEが行います）。

出力は以下のJSON形式のみとし、説明文・コードブロック記号は一切含めないこと。
{"ambiguous": boolean, "field": "対象フィールドキー", "reason": string | null}

【要件項目】
{item_content}',
true);
