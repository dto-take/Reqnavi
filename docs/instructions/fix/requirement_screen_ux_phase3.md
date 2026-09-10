# 指示書：要件定義画面UX改善 フェーズ3（チェックボックス選択・一括操作バー）

## 目的

カードにチェックボックスを追加し、複数選択→画面上部の一括操作バーから「一括で確定」「グループを変更」「不採用にする」を実行できるようにする。

## 前提確認

- 要件定義画面UX改善 フェーズ2（グループ化）が完了していること
- ハンドオフの「C. 一括操作バー」節・「Interactions & Behavior」の1〜5番を再確認してから着手すること

---

## Step 1: 選択状態を管理する

`src/components/domain/requirement-table/RequirementTable.tsx`に、選択状態を持たせる。

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

function toggleSelect(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}

function toggleSelectGroup(groupItemIds: string[]) {
  setSelectedIds((prev) => {
    const allSelected = groupItemIds.every((id) => prev.has(id));
    const next = new Set(prev);
    groupItemIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
    return next;
  });
}

function toggleSelectAll(allItemIds: string[]) {
  setSelectedIds((prev) => (prev.size === allItemIds.length ? new Set() : new Set(allItemIds)));
}
```

- `RequirementCard`にチェックボックスを追加し、`selectedIds.has(item.id)`で選択状態を反映、`toggleSelect(item.id)`を呼ぶ
- `RequirementGroup`の見出しにもチェックボックスを追加し、そのグループ内の全項目IDに対して`toggleSelectGroup`を呼ぶ。一部だけ選択されている場合は「–」（一部選択）を表示する
- 章ページ上部に「全選択」チェックボックスを追加する

## Step 2: 一括操作バーを作成

新規ファイル `src/components/domain/requirement-table/BulkActionBar.tsx`。

デザインハンドオフの「C. 一括操作バー」節の構成を移植する（配色はReqNaviの既存トークンにマップする）。

- `selectedIds.size > 0`の場合のみ、`position: sticky; top: 0`で表示する
- 左：「N件を選択中」
- 右：「一括で確定」「グループを変更▾」（ドロップダウンで既存グループ名一覧＋新規入力を選べる）「不採用にする」「選択解除」

## Step 3: 一括操作のServer Actionを作成

`src/actions/requirement-items.ts`に追加する。

```ts
export async function bulkConfirm(projectId: string, chapterNo: number, itemIds: string[]) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "confirmed" })
    .in("id", itemIds)
    .eq("project_id", projectId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function bulkReject(projectId: string, chapterNo: number, itemIds: string[]) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "rejected" })
    .in("id", itemIds)
    .eq("project_id", projectId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function bulkSetCategory(
  projectId: string,
  chapterNo: number,
  itemIds: string[],
  targetCategory: string
) {
  // 1. itemIdsの content.category を targetCategory に一括更新する
  //    （jsonb更新は行ごとに異なるcontentを個別に扱う必要があるため、対象行を取得して
  //    contentを組み立て直し、個別にUPDATEするループでよい。件数はせいぜい数十件程度を想定）
  // 2. 移動後、フェーズ2のreorderGroupsと同様の考え方で、
  //    移動した項目を対象グループの末尾に配置する形でorder_indexを振り直す
  // 3. revalidatePath
}
```

**注意**：`bulkConfirm`は既存の単票確定と同じ結果になるべきだが、確定不可の条件（もしあれば）を無視して一括確定してしまわないよう、既存の単票確定のロジック・制約を確認し、矛盾が無いようにすること。

## Step 4: 一括操作バーの各ボタンをServer Actionに接続

`RequirementTable.tsx`側で、`BulkActionBar`のボタンから上記Server Actionを呼び出す（`startTransition`＋トースト通知、既存の他の操作と同じパターン）。実行後は`selectedIds`をクリアする。

## Step 5: 動作確認

1. 複数のカードのチェックボックスを選択し、一括操作バーが表示されることを確認する
2. グループ見出しのチェックボックスで、そのグループ内の全項目が一括選択されることを確認する（一部選択時に「–」表示になることも確認する）
3. 「全選択」で章内の全項目が選択されることを確認する
4. 「一括で確定」を実行し、選択した全項目が確定済みになることを確認する
5. 「グループを変更」で新しい区分を選び、選択した項目が一括で別グループに移動することを確認する
6. 「不採用にする」で選択した項目が一括で不採用になることを確認する
7. 「選択解除」で選択状態がクリアされ、一括操作バーが非表示になることを確認する
8. 操作実行後、確定判定ダッシュボードの数値が正しく更新されることを確認する

## やってはいけないこと

- フィルタチップ・グループ軸切替を本フェーズで実装しない（フェーズ4の対象）
- 単票確定と一括確定で、確定可否の判定ロジックに矛盾を生じさせない

## 完了条件

- [ ] 選択状態管理・チェックボックスUI実装済み
- [ ] 一括操作バー実装済み
- [ ] `bulkConfirm`・`bulkReject`・`bulkSetCategory`実装済み
- [ ] 動作確認済み（全パターン）
