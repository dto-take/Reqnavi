# 指示書：カードの「名称」「内容」表示順の修正

## 目的

カードの表示を、「本文候補を1つだけ選ぶ」方式から、**「名称」を見出しとして先に、「内容」相当の列を本文として後に**表示する方式に変更する。

## 前提確認

- カード「本文」列の選定ロジック修正（`pickBodyColumnKey`導入）が完了していること

---

## Step 1: 見出し（name）と本文（detail相当）を分離する

`src/lib/requirement-body-field.ts`を修正する。

```ts
const BODY_FIELD_PRIORITY = ["detail", "issue", "why"];

export function pickBodyColumnKey(availableKeys: string[]): string | null {
  for (const key of BODY_FIELD_PRIORITY) {
    if (availableKeys.includes(key)) return key;
  }
  return availableKeys.find((k) => k !== "category" && k !== "name") ?? null;
}

export function hasTitleColumn(availableKeys: string[]): boolean {
  return availableKeys.includes("name");
}
```

## Step 2: RequirementCardの表示順を修正

`src/components/domain/requirement-table/RequirementCard.tsx`で、以下の順に表示する。

1. バッジ行（既存のまま）
2. **見出し**：`name`列が存在すれば、その値を太字・やや大きめのテキストで表示する（無ければこのブロック自体を省略する）
3. **本文**：`pickBodyColumnKey`で選ばれた列の値を、見出しより通常の太さで表示する
4. **項目サマリ**：`name`・本文列・`category`を除いた残りの列を、これまで通りグリッド表示する

```tsx
{titleValue && <div className="text-sm font-semibold text-primary mb-1">{titleValue}</div>}
<div className="text-sm text-primary">{/* 本文（曖昧表現インライン表示込み） */}</div>
```

**注意**：`name`列自体が存在しないテンプレート（テンプレートA等）では、見出しブロックは表示されず、これまで通り本文のみが先頭に表示される。

## Step 3: 動作確認

1. 1章（お客様概要）を開き、「顧客名」が見出し、「株式会社サンライズ商事」が本文として、この順序で表示されることを確認する
2. 8章（業務要件）を開き、「商談状況のリアルタイム把握困難」が見出し、長い説明文が本文として、この順序で表示されることを確認する
3. `name`列を持たないテンプレートAで、これまで通り「課題・要望」が単独で本文表示されることを確認する
4. 項目サマリに、見出し・本文として表示済みの列が重複して表示されていないことを確認する
5. 曖昧表現のインライン表示が、本文に対して引き続き正しく機能することを確認する

## やってはいけないこと

- `name`列を持たないテンプレートで、空の見出しブロックを表示しない
- 見出し・本文それぞれの列を、項目サマリ側に重複して表示しない

## 完了条件

- [ ] 見出し（name）・本文（detail相当）の分離・表示順修正済み
- [ ] `name`列の有無による出し分けを確認済み
- [ ] 項目サマリの重複表示が無いことを確認済み
