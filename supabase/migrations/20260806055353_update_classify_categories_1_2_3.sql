-- 1〜3章追加に伴い、classify_documentのカテゴリ一覧に「お客様概要」「プロジェクトの目的」
-- 「ロードマップ」を追加する。指示書は既存行をUPDATEする形だったが、直前のカテゴリ修正
-- （開発スコープ・システム定着化支援要件の追加）で確立した方針（プロンプトはバージョン管理し、
-- 既存行を書き換えない。CLAUDE.md規約8）を踏襲し、v3を新規追加してv2を非アクティブ化する。
update prompts set is_active = false where purpose = 'classify_document' and version = 'v2';

insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('classify_document', null, 'v3',
'あなたはSIerの要件定義支援AIです。以下の資料の内容から、この資料がどの要件定義カテゴリに関連しそうかを判定してください。

判定対象カテゴリ（複数選択可）：
お客様概要, プロジェクトの目的, ロードマップ, 業務要件, 機能要件, 非機能要件, システム要件, ビジネス要件, データ移行要件, トレーニング要件, システム運用要件, システム定着化支援要件, 開発スコープ, その他

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"tags": ["カテゴリ名", ...], "summary": "資料内容の一文要約"}

【資料抜粋】
{document_excerpt}',
true);
