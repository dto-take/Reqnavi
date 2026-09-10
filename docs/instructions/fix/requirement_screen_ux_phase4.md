# 指示書：要件定義画面UX改善 フェーズ4（フィルタチップ・グループ軸切替）

## 目的

1. フィルタチップ（すべて/要対応/曖昧表現/確定）を追加し、表示する項目を絞り込めるようにする
2. グループ化の軸を「要件区分」以外（ステータス／なし）にも切り替えられるようにする

## スコープの調整：「優先度」軸は対象外

ハンドオフは「要件区分／ステータス／優先度／なし」の4軸切替を提案しているが、ReqNaviの現状のデータモデルには「優先度」に相当する列が存在しない。**本フェーズでは「要件区分／ステータス／なし」の3軸とする**（優先度列の新設は本フェーズの対象外）。

## 重要な設計判断：並び替えは「要件区分」軸のときのみ有効にする

ハンドオフに明記されている通り、「手動並び順は『要件区分』時のデータ順が唯一の正」とする。**グループ軸が「要件区分」以外（ステータス／なし）のときは、ドラッグ&ドロップによる並び替えを無効化する**（ドラッグハンドルを非表示にする、またはドロップを受け付けない）。これにより、表示上の並びと実データの`order_index`が矛盾する事態を防ぐ。

## 前提確認

- 要件定義画面UX改善 フェーズ3（チェックボックス選択・一括操作バー）が完了していること
- ハンドオフの「7. フィルタチップ」「9. グループ軸切替」節を再確認してから着手すること

---

## Step 1: フィルタ・グループ軸の状態を追加

`src/components/domain/requirement-table/RequirementTable.tsx`に追加する。

```ts
type FilterType = "all" | "todo" | "ambiguous" | "confirmed";
type GroupByAxis = "category" | "status" | "none";

const [filter, setFilter] = useState<FilterType>("all");
const [groupBy, setGroupBy] = useState<GroupByAxis>("category");
```

## Step 2: フィルタ適用ロジックを作成

`src/lib/requirement-grouping.ts`に追加する。

```ts
export function applyFilter<T extends { status: string; ambiguous_flags: unknown[] }>(
  items: T[],
  filter: "all" | "todo" | "ambiguous" | "confirmed"
): T[] {
  if (filter === "todo") return items.filter((i) => i.status === "ai_draft" || i.status === "se_reviewing");
  if (filter === "ambiguous") return items.filter((i) => i.ambiguous_flags.length > 0);
  if (filter === "confirmed") return items.filter((i) => i.status === "confirmed" || i.status === "exception_approved");
  return items;
}

export function groupByStatus<T extends { status: string }>(items: T[]): GroupedItems<T>[] {
  // status値ごとにグループ化する（表示ラベルは既存のStatusBadgeのラベル定義を再利用する）
}

export function groupByNone<T>(items: T[]): GroupedItems<T>[] {
  return [{ category: "", items }];
}
```

**注意**：フィルタは**表示上の絞り込みのみ**とし、`order_index`等の実データには一切影響を与えない。フィルタで0件になったグループも、見出し自体は残し「該当なし」を表示する。

## Step 3: フィルタチップ・グループ軸切替のUIを追加

新規ファイル `src/components/domain/requirement-table/FilterBar.tsx`。

デザインハンドオフの「B. メインヘッダー 2行目」節の構成を移植する。

- フィルタチップ（単一選択、件数付き）：「すべて N」「要対応 N」「曖昧表現 N」「確定 N」
- グループ軸切替：「グループ：要件区分 ▾」（クリックで要件区分→ステータス→なし→要件区分…と循環、またはドロップダウンで選択）

`RequirementTable.tsx`側で、`groupBy`の値に応じて`groupByCategory`/`groupByStatus`/`groupByNone`のいずれかを使い分け、`filter`の値で`applyFilter`を適用してから描画する。

## Step 4: 並び替えの無効化

`groupBy !== "category"`の場合、`RequirementCard`のドラッグハンドル・`RequirementGroup`見出しのドラッグハンドルを非表示にする（`draggable`属性自体も外す）。

## Step 5: 動作確認

1. フィルタチップで「要対応」を選び、未確定の項目のみ表示されることを確認する
2. 「曖昧表現」で、曖昧表現を含む項目のみ表示されることを確認する
3. フィルタで0件になったグループでも、見出し自体は残り「該当なし」等の表示になることを確認する
4. グループ軸を「ステータス」に切り替え、ステータスごとにグループ化されることを確認する
5. 「ステータス」「なし」軸のとき、ドラッグハンドルが表示されず、並び替えができないことを確認する
6. 「要件区分」に戻すと、フェーズ2で確立した並び替えが引き続き機能することを確認する
7. フィルタとグループ軸の組み合わせでも正しく表示されることを確認する

## やってはいけないこと

- 「優先度」軸のための新しい列を追加しない
- グループ軸が「要件区分」以外のときに、誤って`order_index`を書き換える経路を残さない
- フィルタによって0件になったグループの見出しを非表示にしない

## 完了条件

- [ ] フィルタチップ実装済み
- [ ] グループ軸切替（要件区分/ステータス/なし）実装済み
- [ ] 「要件区分」以外での並び替え無効化を確認済み
- [ ] フィルタ×グループ軸の組み合わせ動作確認済み
