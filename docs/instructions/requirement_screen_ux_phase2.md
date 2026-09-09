# 指示書：要件定義画面UX改善 フェーズ2（グループ化）

## 目的

カード化済みの一覧（フェーズ1）に、`content.category`（要件区分）によるグループ見出しを追加する。グループの開閉、グループ内でのカード並び替え、グループ間へのドラッグ（区分の変更を伴う）、グループ見出し自体の並び替えに対応する。

## 重要な設計判断：新しいテーブル・列は追加しない

グループの並び順は、既存の`order_index`（章全体を通したグローバルな並び順）をそのまま再利用する。

- **グループの初期順序**：各カテゴリ（`content.category`）に属する項目のうち、`order_index`が最小のものの位置で決まる
- **グループ見出し自体の並び替え**：ユーザーがグループを並び替えたら、新しいグループ順に沿って章内の全項目の`order_index`を振り直す（各グループ内部の相対順序は維持）
- **カードをグループ間にドラッグ**：ドロップ先のカードの`order_index`を基準に、`content.category`と`order_index`の両方を同時に更新する

この方式により、グループ順序を管理する新しいテーブル・列を追加せずに済む。

グループの開閉状態は、DBではなく**ブラウザのlocalStorage**に保存する（ユーザー個人の表示設定であり、DBで管理するほどの重要性は無いと判断する）。

## 前提確認

- 要件定義画面UX改善 フェーズ1（カード化）が完了していること
- ハンドオフの「9. グループ軸切替」「10. 並び替え」節を再確認してから着手すること

---

## Step 1: グループ化のロジックを作成

新規ファイル `src/lib/requirement-grouping.ts`（通常モジュール、DBに依存しない純粋関数）。

```ts
export type GroupedItems<T> = { category: string; items: T[] };

export function groupByCategory<T extends { content: { category?: string }; order_index: number }>(
  items: T[]
): GroupedItems<T>[] {
  // items は既に order_index 順にソート済みである前提。
  // category の初出順にグループを作り、各グループ内では items の元の順序を維持する。
  // category が空文字・未設定の場合は「未分類」という名前のグループにまとめる。
}
```

## Step 2: グループ移動・グループ並び替えのServer Actionを作成

`src/actions/requirement-items.ts`に追加する。

```ts
export async function moveItemToGroup(
  projectId: string,
  chapterNo: number,
  itemId: string,
  targetCategory: string,
  insertBeforeItemId: string | null
) {
  // 既存のドラッグ&ドロップ並び替え（reorderRequirementItems、規約42のタイブレーカー込み安定ソートを踏襲）と
  // 同様の考え方で、対象章の全項目を order_index 順に取得し、
  // itemId を一旦除外した配列に対して、insertBeforeItemId の直前（nullなら末尾）に itemId を挿入する。
  // 挿入と同時に、itemId の content.category を targetCategory に更新する。
  // 最後に、配列全体の order_index を 0 から振り直して一括更新する。
}

export async function reorderGroups(
  projectId: string,
  chapterNo: number,
  orderedCategories: string[]
) {
  // 現在の全項目を取得し、既存のグループ内の相対順序を維持したまま、
  // orderedCategories の順にグループを並べ直した配列を作る。
  // その配列の順に order_index を 0 から振り直して一括更新する。
}
```

**注意**：`reorderRequirementItems`（既存のドラッグ&ドロップ並び替え機能）との重複を避けるため、共通化できる部分があれば内部で共有するヘルパー関数に切り出すことを検討してよい（必須ではない）。

## Step 3: グループ見出しコンポーネントを作成

新規ファイル `src/components/domain/requirement-table/RequirementGroup.tsx`。

デザインハンドオフの「グループ見出し」節の構成を移植する。

- 開閉キャレット（クリックで開閉、状態はlocalStorageに保存）
- グループ名（`content.category`の値）
- 件数
- 状態ピル（未確定が1件でもあれば「未確定 N」、無ければ「すべて確定」）
- 「この束を一括確定」ボタン（グループ内の未確定項目を全て確定する）
- 折りたたみ時のプレースホルダ（件数・曖昧表現を含む旨・「開く」）

グループ見出し自体にドラッグハンドルを付け、グループ単位での並び替え（`reorderGroups`の呼び出し）に対応する。

## Step 4: RequirementTableをグループ表示に対応させる

`src/components/domain/requirement-table/RequirementTable.tsx`を、`groupByCategory`の結果をもとに、`RequirementGroup`でカード群をラップする形に修正する。

- カードのドラッグ&ドロップを、**同一グループ内の並び替え**と**別グループへの移動**の両方に対応させる
- 挿入位置インジケーター（既存のドラッグ&ドロップ並び替え機能で実装済み）は、グループ間移動でも同様に機能させる

## Step 5: 動作確認

1. 複数の区分（category）を持つ章を開き、区分ごとにグループ見出しが表示されることを確認する
2. グループを開閉し、状態がページ遷移後も維持されることを確認する
3. グループ内でカードをドラッグし、順序が正しく変わることを確認する
4. あるカードを別のグループにドラッグし、`content.category`が変わり、正しい位置に挿入されることを確認する
5. グループ見出し自体をドラッグして並び替え、章全体の表示順が変わることを確認する（リロード後も維持されることを確認する）
6. 「この束を一括確定」で、そのグループの未確定項目が全て確定することを確認する
7. 折りたたみ中のグループに曖昧表現を含む項目がある場合、プレースホルダにその旨が表示されることを確認する

## やってはいけないこと

- グループ順序管理のための新しいテーブル・列を追加しない
- チェックボックスによる複数選択・一括操作バーを本フェーズで実装しない（フェーズ3の対象）

## 完了条件

- [ ] `groupByCategory`実装済み
- [ ] `moveItemToGroup`・`reorderGroups`実装済み
- [ ] `RequirementGroup`実装済み
- [ ] グループ内・グループ間のドラッグ&ドロップ、グループ自体の並び替えが動作確認済み
- [ ] 開閉状態のlocalStorage永続化を確認済み
