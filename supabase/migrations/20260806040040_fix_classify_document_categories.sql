-- classify_documentのカテゴリ一覧に「開発スコープ」（6章）「システム定着化支援要件」（14章）が
-- 含まれておらず、この2章向けの資料がAI素案生成（generateDraft）から見つからない状態だった。
-- promptsはバージョン管理する方針（CLAUDE.md規約8）のため、既存v1行を書き換えず、
-- v2を新規追加してis_activeを切り替える（既存のai_interactions.prompt_idが指す
-- v1の内容はそのまま保持され、過去の実行時に実際に使われたプロンプト文言を維持する）。
update prompts set is_active = false where purpose = 'classify_document' and version = 'v1';

insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('classify_document', null, 'v2',
'あなたはSIerの要件定義支援AIです。以下の資料の内容から、この資料がどの要件定義カテゴリに関連しそうかを判定してください。

判定対象カテゴリ（複数選択可）：
業務要件, 機能要件, 非機能要件, システム要件, ビジネス要件, データ移行要件, トレーニング要件, システム運用要件, 開発スコープ, システム定着化支援要件, その他

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"tags": ["カテゴリ名", ...], "summary": "資料内容の一文要約"}

【資料抜粋】
{document_excerpt}',
true);
