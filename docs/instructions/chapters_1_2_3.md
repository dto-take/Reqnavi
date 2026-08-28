# 指示書：1〜3章（お客様概要・プロジェクトの目的・ロードマップ）の実装

## 目的

未実装だった1〜3章を、既存のテンプレートC（項目一覧型）を流用する形で実装する。`docs/01_requirements.md`の当初方針どおり、この3章は軽量な対応（新規の専用エディタは作らない）で十分とする。

## 併せて対応すること：章名リストの一元化（CLAUDE.md規約36への対応）

これまで`CHAPTER_NAMES`・`CHAPTER_TEMPLATE_MAP`・AI分類プロンプトのカテゴリ一覧が複数箇所に分散し、既に一度不整合（開発スコープ・システム定着化支援要件が分類されない問題）が発生している。今回1〜3章を追加するタイミングで、TypeScript側の一覧を1箇所に集約する。

## 前提確認

- エラー画面の整備が完了していること

---

## Step 1: 章名・テンプレート対応表を一元化

新規ファイル `src/lib/chapters.ts`（通常モジュール）。

```ts
export const CHAPTER_NAMES: Record<number, string> = {
  1: "お客様概要", 2: "プロジェクトの目的", 3: "ロードマップ", 4: "KPI",
  5: "システム要件", 6: "開発スコープ", 7: "ビジネス要件", 8: "業務要件",
  9: "機能要件", 10: "非機能要件", 11: "データ移行要件", 12: "トレーニング要件",
  13: "システム運用要件", 14: "システム定着化支援要件", 15: "進捗",
};

// テンプレートA/B/C（フラットな行構造）を使う章のみ。4(D)・10(E)・15(ガント)は含めない
export const CHAPTER_TEMPLATE_MAP: Record<number, string> = {
  1: "C", 2: "C", 3: "C",
  5: "A", 6: "C", 7: "A", 8: "C", 9: "C",
  11: "B", 12: "C", 13: "B", 14: "B",
};

// 注意：このリストを変更した場合、`prompts`テーブルのpurpose='classify_document'の
// カテゴリ一覧も必ず同時に更新すること（DBに保存されたプロンプト本文のため、
// このファイルをimportするだけでは自動反映されない）。
```

以下のファイルで、ローカルに定義していた同名の定数をこのファイルからのimportに置き換える（重複定義を削除する）。

- `src/actions/ai-draft.ts`（`CHAPTER_NAMES`）
- `src/actions/readiness.ts`（`FLAT_TEMPLATE_CHAPTERS` → `CHAPTER_TEMPLATE_MAP`に統一）
- `src/actions/consistency.ts`（`FLAT_TEMPLATE_CHAPTERS` → `CHAPTER_TEMPLATE_MAP`に統一）
- `src/app/projects/[id]/chapters/[chapterNo]/page.tsx`（`CHAPTER_TEMPLATE_MAP`・`CHAPTER_NAMES`）
- `src/app/projects/[id]/layout.tsx`（`CHAPTER_NAMES`）

**注意**：変数名を統一する際、importの付け替えだけでなく、各ファイル内でその変数を参照している箇所（例：`FLAT_TEMPLATE_CHAPTERS`という名前で呼んでいた箇所）も新しい変数名に置き換えることを忘れないこと。

## Step 2: AI分類プロンプトのカテゴリ一覧を更新

```bash
supabase migration new update_classify_categories_1_2_3
```

```sql
update prompts
set prompt_body = 'あなたはSIerの要件定義支援AIです。以下の資料の内容から、この資料がどの要件定義カテゴリに関連しそうかを判定してください。

判定対象カテゴリ（複数選択可）：
お客様概要, プロジェクトの目的, ロードマップ, 業務要件, 機能要件, 非機能要件, システム要件, ビジネス要件, データ移行要件, トレーニング要件, システム運用要件, システム定着化支援要件, 開発スコープ, その他

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"tags": ["カテゴリ名", ...], "summary": "資料内容の一文要約"}

【資料抜粋】
{document_excerpt}'
where purpose = 'classify_document';
```

## Step 3: 既存ページがそのまま使えることを確認

1〜3章は既存の`chapters/[chapterNo]/page.tsx`（テンプレートC対応・汎用実装）がそのまま使えるため、**新しいページファイルの作成は不要**。Step1の`CHAPTER_TEMPLATE_MAP`に1・2・3を追加したことで、自動的に到達可能になる。

サイドバー（`layout.tsx`）も`selectedChapters`をそのまま列挙する実装のため、案件作成時に1〜3章を選択していれば自動的にリンクが表示される。

## Step 4: 動作確認

1. `/projects/{id}/chapters/1` にアクセスし、テンプレートCのテーブル（区分・分類／名称／内容／種別...列）が表示されることを確認
2. 手動で「対象組織」「対象ユーザー」等の行を追加できることを確認（お客様概要の代替表現として）
3. `/projects/{id}/chapters/2` で「ご検討背景」「目的」「具体的内テーマ」「留意事項」を、それぞれ`category`列に区分名、`detail`列に内容を入れる形で4行程度登録できることを確認
4. `/projects/{id}/chapters/3` で「フェーズ1」「フェーズ2」...のような行を`category`＋`detail`で登録できることを確認
5. Gemini APIのクォータが回復していれば、資料をアップロードして「お客様概要」「プロジェクトの目的」「ロードマップ」に分類されることを確認し、いずれかの章でAI素案生成を実行してみる
6. `/projects/{id}/readiness`（充足率ダッシュボード）に1・2・3章が対象として表示されることを確認
7. `/projects/{id}/consistency`（整合性チェック・全体）でも1・2・3章の孤立要件検知が機能することを確認

## やってはいけないこと

- 1〜3章専用の新しいテーブル・エディタコンポーネントを作らない（テンプレートCの流用で完結させる）
- `src/lib/chapters.ts`への一元化の際、既存の動作（5〜14章）を壊さないよう、各ファイルの参照箇所を漏れなく置き換える

## 完了条件

- [ ] `src/lib/chapters.ts`作成済み、関連ファイルがすべてこれをimportする形に統一済み
- [ ] AI分類プロンプトのカテゴリ一覧更新済み
- [ ] 1〜3章がテーブルエディタとして表示・編集できることを確認済み
- [ ] 充足率ダッシュボード・整合性チェックに1〜3章が反映されることを確認済み
