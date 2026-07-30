# CLAUDE.md

このファイルは、本リポジトリでコード開発を行うAIアシスタント（Claude Code等）向けのプロジェクトガイドです。作業前に必ず `docs/01_requirements.md` と `docs/02_architecture.md` を参照してください。

## プロジェクト概要

**ReqNavi** — AI活用型・要件定義支援サービス（社内向け）。

SIerの要件定義工程を、資料からのAI素案生成 → SEによるリファインメント → 確定判定ゲート、という流れで支援し、要件定義工数の40%削減と、確定後の仕様ブレ防止を目的とする。**顧客は本システムを直接操作しない。操作者は常に自社SE・PM・（Phase1より）外注SEに限定される。**

現在のフェーズ：**Phase 1（MVP）**。対象範囲は `docs/01_requirements.md` §6 を参照。

## 技術スタック

- Next.js 15 (App Router) / Vercel
- Supabase（PostgreSQL + RLS / Auth / Storage / Realtime / Edge Functions）
- AI API（Gemini or Claude、Edge Functions・Server Actions経由のみで呼び出す。APIキーをクライアントに露出させない）
- 社内の別プロジェクト（PM Vision）と同一スタックを採用。認証設計もPM Vision準拠

## 絶対に守るべき規約

1. **JWTクレーム名は `user_role`。`role` は使わない**（Supabaseの予約語と衝突するため）。
2. **`organizations`（顧客企業）と `companies`（自社/パートナー会社）を混同しない。** 前者は案件の発注元、後者はユーザーの所属先。
3. AI呼び出しは必ず Edge Functions / Server Actions 経由。フロントエンドから直接AI APIを呼ばない。
4. AIの出力は必ず `status = 'ai_draft'` 等の未確定ステータスで保存する。確定済み（`confirmed`）項目をAIが無断で上書きしてはならない（Flow2は提案のみ、`ai_reconciliation_suggestions` 経由）。
5. 全テーブルに `project_id`（および `tenant_id`）を持たせ、RLSを同一マイグレーション内で有効化する。
6. パートナー（`user_role = 'partner'`）には、コスト関連項目（`change_requests.estimation_impact` 等）と組織横断機能（Phase4）を絶対に見せない。
7. 依存関係に基づく自動発火（DB Webhook・cron監視）は実装しない。整合性チェック・差分最適化は**すべてボタン起点**のユーザー操作で実行する。
8. AI抽出結果は必ずZodスキーマでバリデーションしてから保存する。プロンプトは `prompts` テーブルでバージョン管理し、`ai_interactions` に `prompt_id` を記録する。

## ディレクトリ構成（想定）

```
reqnavi/
├── CLAUDE.md
├── docs/
│   ├── 01_requirements.md
│   └── 02_architecture.md
├── src/
│   ├── app/                 # Next.js App Router
│   ├── actions/              # Server Actions
│   ├── components/domain/    # テーブルエディタ・フロー図・ガント等
│   └── lib/ai/                # AI呼び出し・reconcile()
└── supabase/
    ├── migrations/
    └── functions/            # Edge Functions
```

## 既知の未決事項（開発中に確認が必要）

- [TD-001] AI APIベンダーとの「学習未使用」契約条件は法務確認待ち。確認前に機密度の高い案件データを投入しないこと。
- [TD-002] 本サービス自体の運用・保守の恒久的な担当部門が未確定（`docs/01_requirements.md` §13参照）。
- [TD-003] 「同一顧客の他案件参照」（Phase4, `allow_cross_project_reference`）の運用ルール（誰がいつオンにするか）は未確定。

## 開発の進め方

各Phaseの機能は `docs/01_requirements.md` §9（機能要件）の対応Phase列を参照し、該当するものから着手する。実装が要件定義書の内容から逸脱する場合は、`docs/02_architecture.md` の改訂履歴に変更概要を追記すること（PM Visionの `02_アーキテクチャ設計書.md` の運用に倣う）。
