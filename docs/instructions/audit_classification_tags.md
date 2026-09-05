# 指示書：AI生成機能が参照するタグと分類カテゴリ一覧の突き合わせ確認

## 目的

各AI生成機能（Flow1・業務フロー・非機能要件・KPI）が`classified_tags`で検索しているタグ名が、`classify_document`プロンプトの分類カテゴリ一覧に漏れなく含まれているか、実際のコード・DBを突き合わせて確認する。手作業の記憶ではなく、grepとDB確認の両方で機械的に検証する（規約36・37の教訓）。

## 前提確認

- KPI分類カテゴリの追加が完了していること

---

## Step 1: コード側で参照している全タグを洗い出す

```bash
grep -rn "classified_tags" src/actions src/lib
```

見つかった全箇所（想定：`ai-draft.ts`のCHAPTER_NAMES参照、`ai-draft-business-flow.ts`のDOCUMENT_TAG_BY_FLOW_TYPE、`ai-draft-nonfunctional.ts`、`ai-draft-kpi.ts`）から、実際に検索対象としているタグ文字列を全て列挙する。

- `ai-draft.ts`（Flow1）については、`CHAPTER_NAMES`（`src/lib/chapters.ts`）の値のうち、`CHAPTER_TEMPLATE_MAP`に含まれる章番号（Flow1が実際に処理する章）に対応する値のみを対象とする（4・10・15章等、Flow1が扱わない章の名称は対象外）

## Step 2: 現在アクティブな分類プロンプトのカテゴリ一覧を取得

```sql
select version, prompt_body from prompts where purpose = 'classify_document' and is_active = true;
```

`prompt_body`から「判定対象カテゴリ」の一覧部分を抜き出す。

## Step 3: 突き合わせ

Step1で列挙した全タグが、Step2のカテゴリ一覧に1つずつ含まれているか確認する。表形式で整理すると分かりやすい。

| コード側で検索しているタグ | 分類カテゴリ一覧に含まれるか |
|---|---|
| （Step1の結果を1行ずつ） | チェック または 不一致 |

**含まれていないタグが1つでも見つかった場合**、そのタグに対応するAI生成機能は今回のKPIと同じ理由で永久に対象資料を発見できない状態にある。見つかった場合は、KPI追加時と同じ手順（新バージョンのプロンプトを追加、旧バージョンを非アクティブ化）でマイグレーションを作成し、ローカル・Staging両方に反映すること。

## Step 4: 報告

突き合わせ結果（全て一致していたか、不一致があった場合は何が見つかりどう対応したか）を報告すること。

## やってはいけないこと

- Step1のgrep結果を見ずに、記憶や推測でタグの一覧を決めつけない
- 不一致が見つかった場合に、SQLを直接実行するだけで済ませない（マイグレーションとして残す）

## 完了条件

- [ ] コード側の全タグ洗い出し済み（grepベース）
- [ ] 分類カテゴリ一覧との突き合わせ完了
- [ ] 不一致があれば修正・マイグレーション化・Staging反映済み
- [ ] 結果報告済み
