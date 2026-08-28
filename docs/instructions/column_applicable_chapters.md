# 指示書：テンプレート列の章別適用範囲を追加（TD-004対応）

## 目的

`chapter_column_templates`が`template_type`単位でしか列を管理していないため、9章専用の列（`platform_feature`・`screen_pattern`等）が、同じテンプレートCを使う他の章（1,2,3,6,8,12）にも無関係に表示されている。列ごとに「どの章で使うか」を持たせ、章に無関係な列を非表示にする。これにより`docs/CLAUDE.md`のTD-004（充足率判定での同種の問題）も併せて解消する。

## 前提確認

- Phase4 Step1（案件横断連携）が完了していること

---

## Step 1: applicable_chapters列を追加し、既存の拡張列に適用範囲を設定

```bash
supabase migration new add_column_applicable_chapters
```

```sql
-- NULL = そのtemplate_typeを使う全章に適用（既存の大半の列はこのまま）
alter table chapter_column_templates add column if not exists applicable_chapters int[];

-- 9章（機能要件）専用の列
update chapter_column_templates
set applicable_chapters = array[9]
where column_key in ('platform_feature', 'screen_pattern', 'screen_fields', 'screen_actions', 'field_definitions', 'external_if');

-- 11章（データ移行要件）専用の列
update chapter_column_templates
set applicable_chapters = array[11]
where column_key in ('how', 'how_much');
```

`supabase db reset` で反映する。

## Step 2: 列定義取得ロジックを章対応に修正

`src/actions/requirement-items.ts`の`listColumnDefs`を修正する。

```ts
// 修正前: export async function listColumnDefs(templateType: string): Promise<ColumnDef[]> {
// 修正後:
export async function listColumnDefs(templateType: string, chapterNo: number): Promise<ColumnDef[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("chapter_column_templates")
    .select("column_key, label, data_type, order_index, applicable_chapters")
    .eq("template_type", templateType)
    .order("order_index");
  if (error) throw error;

  // applicable_chaptersがnull（全章共通）、またはこの章番号を含む場合のみ残す
  return (data ?? []).filter(
    (c) => c.applicable_chapters === null || (c.applicable_chapters as number[]).includes(chapterNo)
  );
}
```

呼び出し元（`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`）を修正する。

```ts
// 修正前: const columns = await listColumnDefs(templateType);
// 修正後:
const columns = await listColumnDefs(templateType, chapterNum);
```

**注意**：`listColumnDefs`を呼んでいる他の箇所（Salesforceマッピング機能・案件横断参照ページ等）があれば、そちらも同様に`chapterNo`を渡す形に修正すること。呼び出し箇所を`grep -rn "listColumnDefs"`で確認し、漏れなく対応する（CLAUDE.md規約36の教訓を踏まえ、手作業の列挙だけに頼らない）。

## Step 3: 充足率ダッシュボードのTD-004を正式に解消

`src/actions/readiness.ts`の`needHearingCount`算出ロジックを、ハードコードされた除外リストではなく`applicable_chapters`を使う形に修正する。

```ts
// 修正前: chapter_column_templates から template_type のみで列を取得し、
//        9章専用列等をJS側の知識で除外していた（TD-004）
// 修正後:
const { data: columns } = await supabase
  .from("chapter_column_templates")
  .select("column_key, applicable_chapters")
  .eq("template_type", templateType);
const columnKeys = (columns ?? [])
  .filter((c) => c.applicable_chapters === null || (c.applicable_chapters as number[]).includes(chapterNo))
  .map((c) => c.column_key);
```

これにより、11章（データ移行要件）の`how`/`how_much`が要ヒアリング判定の対象に正しく含まれるようになる（TD-004で記録した簡略化の副作用が解消される）。

## Step 4: 動作確認

1. `/projects/{id}/chapters/1`（お客様概要）にアクセスし、テーブルの列が「区分・分類／名称／内容／種別」の4列のみになっていることを確認（画面パターン・SFDC機能等が表示されないこと）
2. `/projects/{id}/chapters/9`（機能要件）では、これまでと同じ全列（画面パターン・SFDC機能・項目定義・外部IF定義含む）が表示されることを確認
3. `/projects/{id}/chapters/11`（データ移行要件）で、「どのように」「どのくらい」列が表示されることを確認
4. `/projects/{id}/chapters/13`（システム運用要件）では「どのように」「どのくらい」列が表示されないことを確認
5. `/projects/{id}/readiness` で、11章の要ヒアリング件数が、`how`/`how_much`が空欄の項目を正しく含めて計算されていることを確認（Step3で解消したTD-004の直接確認）

## やってはいけないこと

- `applicable_chapters`を追加した後も、既存の列（`category`・`name`・`detail`・`item_type`等の共通列）には`applicable_chapters`を設定しない（`null`のままにし、全章共通で使えるようにする）

## 完了条件

- [ ] `applicable_chapters`列追加・既存拡張列への設定済み
- [ ] `listColumnDefs`が章番号を考慮する形に修正済み（呼び出し元も含めて漏れなく）
- [ ] 充足率ダッシュボードのTD-004が解消済み
- [ ] 1章・9章・11章・13章での列表示が意図通りであることを確認済み

---

完了したら、`docs/CLAUDE.md`のTD-004を「解消済み」に更新すること。
