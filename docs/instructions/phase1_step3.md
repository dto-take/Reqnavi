# 指示書：Phase1 Step3 汎用構造化テーブルエディタ（テンプレートB・C 横展開）

## 目的

Phase1 Step2で検証済みのテンプレートA（課題解決型）の基盤を使い、テンプレートB（5W1H型）・C（項目一覧型）を横展開する。`RequirementTable`コンポーネント自体は列を可変で受け取る設計のため、**変更は不要**（列定義データを追加し、章とテンプレートの対応表を拡張するのみ）。詳細は `docs/01_requirements.md` §9・`docs/02_architecture.md` 2.2節を参照。

## 前提確認

- Phase1 Step2（テンプレートA、5章・7章）が動作確認済みであること

---

## Step 1: テンプレートB・Cの列定義をシード

```bash
supabase migration new seed_template_bc_columns
```

```sql
-- B. 5W1H型（データ移行要件・システム運用要件・システム定着化支援要件で使用）
-- how/how_mount はデータ移行要件のみで使う列。他章では空欄のままでよい（列自体は共通）
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('B', 'what',      '何を',   'text', 1),
  ('B', 'who',       '誰が',   'text', 2),
  ('B', 'when',      'いつ',   'text', 3),
  ('B', 'where',     '何処で', 'text', 4),
  ('B', 'why',       'なぜ',   'text', 5),
  ('B', 'how',       'どのように（データ移行要件のみ使用）', 'text', 6),
  ('B', 'how_much',  'どのくらい（データ移行要件のみ使用）', 'text', 7)
on conflict (template_type, column_key) do nothing;

-- C. 項目一覧型（開発スコープ・業務要件・機能要件・トレーニング要件の対象一覧で使用）
-- platform_feature は機能要件のみで使う列。他章では空欄のままでよい
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('C', 'category',        '区分・分類', 'text', 1),
  ('C', 'name',             '名称',       'text', 2),
  ('C', 'detail',           '内容',       'text', 3),
  ('C', 'item_type',        '種別',       'text', 4),
  ('C', 'platform_feature', '対応機能（SFDC機能・機能要件のみ使用）', 'text', 5)
on conflict (template_type, column_key) do nothing;
```

`supabase db reset` で反映する。

## Step 2: 章とテンプレートの対応表を拡張

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx` を開き、`CHAPTER_TEMPLATE_MAP`とページタイトル表示を以下のように拡張する。

```tsx
const CHAPTER_TEMPLATE_MAP: Record<number, string> = {
  5: "A", 7: "A",
  11: "B", 13: "B", 14: "B",
  6: "C", 8: "C", 9: "C", 12: "C",
};

const CHAPTER_NAMES: Record<number, string> = {
  5: "システム要件", 7: "ビジネス要件",
  11: "データ移行要件", 13: "システム運用要件", 14: "システム定着化支援要件",
  6: "開発スコープ", 8: "業務要件", 9: "機能要件", 12: "トレーニング要件",
};
```

タイトル表示部分の三項演算子（`chapterNum === 5 ? "システム要件" : "ビジネス要件"`）を`CHAPTER_NAMES[chapterNum]`を使う形に置き換える。

```tsx
<h1 className="text-base font-semibold text-primary">
  {chapterNum}. {CHAPTER_NAMES[chapterNum]}
</h1>
```

## Step 3: 動作確認

以下の各章で、行追加・セル編集・確定が一通り動作することを確認する。

| 章 | テンプレート | 確認内容 |
|---|---|---|
| 11. データ移行要件 | B | 「どのように」「どのくらい」列も表示され、入力・保存できる |
| 13. システム運用要件 | B | 「どのように」「どのくらい」列は表示されるが空欄のままで支障がない |
| 14. システム定着化支援要件 | B | 同上 |
| 6. 開発スコープ | C | 「対応機能」列は空欄のままで支障がない |
| 8. 業務要件 | C | 同上 |
| 9. 機能要件 | C | 「対応機能」列に手動でSFDC標準機能名を入力できる（AIによる自動提案は機能No.19で別途実装） |
| 12. トレーニング要件 | C | 同上（このページは対象一覧の表部分のみ。前提条件等の自由記述部分は別途対応） |

## やってはいけないこと

- `RequirementTable`コンポーネント自体にテンプレート固有の分岐（`if template === 'B'`等）を書き加えない。列定義データ側で表現し、コンポーネントは汎用のまま保つ（設計の一貫性を保つため）
- 「機能要件のみ使う列」「データ移行要件のみ使う列」の存在を理由に、テンプレートを分割しない（1テンプレート1列セットの単純さを優先する方針）

## 完了条件

- [ ] テンプレートB・Cの列定義シード済み
- [ ] `CHAPTER_TEMPLATE_MAP`・`CHAPTER_NAMES`拡張済み
- [ ] 上表7章すべてで表示・編集・確定の動作確認済み
