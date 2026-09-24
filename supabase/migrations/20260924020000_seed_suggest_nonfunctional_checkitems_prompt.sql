-- nonfunctional_ux_phase3.md Step1：選択中観点の方針・他章の確定済み内容を踏まえ、
-- チェック項目候補を2件、根拠付きで提案するプロンプト（suggest_kpi_childrenと同じ構成）。
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('suggest_nonfunctional_checkitems', 'E', 'v1',
'あなたはSIerの要件定義支援AIです。以下の非機能要件の観点の文脈をもとに、チェック項目の候補を2件提案してください。

各候補には、なぜその内容が妥当かという「根拠」を1文必ず添えてください。

【観点名】
{aspect_name}

【この観点の方針】
{policy}

【他章の確定済み内容（参考）】
{other_chapter_context}

【今回除外してほしい候補（既に提示済み・却下済み）】
{exclude_texts}

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"candidates": [{"text": "候補の内容", "why": "根拠"}]}',
true);
