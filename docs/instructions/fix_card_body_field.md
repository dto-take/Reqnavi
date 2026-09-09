# 指示書：カード「本文」列の選定ロジック修正（フェーズ1の設計不具合の是正）

## 目的

フェーズ1で「先頭列（order_index最小）＝本文」というルールにした結果、テンプレートCの章で「区分・分類」（グループ見出しと重複する短い分類名）が本文として表示され、実際に読みたい「内容」等の長文が項目サマリの小さな表示に埋もれてしまっていた。本文として選ぶ列を、内容のある列を優先する形に修正する。

## 前提確認

- 要件定義画面UX改善 フェーズ5が完了していること

---

## Step 1: 本文列選定の共通ロジックを作成

新規ファイル `src/lib/requirement-body-field.ts`（通常モジュール）。

```ts
const BODY_FIELD_PRIORITY = ["detail", "issue", "why", "name"];

export function pickBodyColumnKey(availableKeys: string[]): string | null {
  for (const key of BODY_FIELD_PRIORITY) {
    if (availableKeys.includes(key)) return key;
  }
  return availableKeys.find((k) => k !== "category") ?? null;
}
```

**注意**：`src/actions/project-overview.ts`の`getRecentKnowledge`に、これと似た優先順位のフォールバックチェーン（`content.name ?? content.detail ?? content.issue ?? content.why`）が既に存在する。**この2箇所のロジックを重複させず、`pickBodyColumnKey`に一本化する**（`getRecentKnowledge`側も、`listColumnDefs`から取得できる列一覧を使ってこの関数を呼ぶ形に書き換える）。

## Step 2: RequirementCardの本文選定を修正

`src/components/domain/requirement-table/RequirementCard.tsx`で、「先頭列（order_index最小）を本文とする」実装を、`pickBodyColumnKey(columns.map(c => c.column_key))`を使う形に修正する。

- 本文列として選ばれた列は、項目サマリ（残りの列を並べる部分）からは除外する
- `category`列は、本文候補から除外した上で、バッジ行（曖昧表現・AI素案・出典等が並ぶ行）に小さなタグとして表示する

## Step 3: 曖昧表現のインライン表示（フェーズ5）との整合性を確認

フェーズ5で実装した曖昧表現のインライン表示は「本文列」に対して行っていたはずなので、本文列が変わった今、実際に曖昧な言い回しが出やすい「内容」列に対してインライン表示が機能するようになっているかを確認する。

## Step 4: 動作確認

1. テンプレートCの章（8章・9章等）を開き、カードの本文に「内容」（またはそれに準ずる列）の長文が表示されることを確認する
2. 「区分・分類」が本文からバッジ表示に変わっていることを確認する
3. 項目サマリに、本文として選ばれた列が重複して表示されていないことを確認する
4. テンプレートA・Bの章でも、本文列の選定が適切であることを確認する
5. 曖昧表現のインライン表示が、実際に曖昧な言い回しを含む「内容」列に対して機能することを確認する
6. 案件トップ画面の「ナレッジ」一覧が、`pickBodyColumnKey`への一本化後も引き続き正しい要約文を表示することを確認する

## やってはいけないこと

- `pickBodyColumnKey`のロジックを`RequirementCard`と`getRecentKnowledge`で別々に持たせたままにしない
- `category`の情報を完全に消してしまわない（バッジとして残す）

## 完了条件

- [ ] `pickBodyColumnKey`実装・一本化済み
- [ ] `RequirementCard`の本文選定修正済み
- [ ] `category`のバッジ表示追加済み
- [ ] 曖昧表現インライン表示との整合性確認済み
- [ ] 全テンプレート（A/B/C）・ナレッジ一覧での動作確認済み
