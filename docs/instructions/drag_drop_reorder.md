# 指示書：ドラッグ&ドロップによる並び替え（上下ボタンの置き換え）

## 目的

前回実装した▲▼ボタンによる並び替えを、行をドラッグして好きな位置に移動できるドラッグ&ドロップ操作に置き換える。新しいライブラリは追加せず、ブラウザ標準のHTML5 Drag and Drop APIを使う。

## 前提確認

- 前回のAI生成結果の並び替え（▲▼ボタン、`order_index`永続化）が完了していること

---

## Step 1: 上下ボタンを削除し、ドラッグハンドルに置き換える

`src/components/domain/requirement-table/RequirementTable.tsx`から、前回追加した▲▼ボタン（`handleMove`とそのUI）を削除する。`moveRequirementItem`のimportも削除する（Server Action自体は`requirement-items.ts`に残しておいてよいが、このコンポーネントからは呼ばなくなる）。

各行の先頭に、ドラッグ用のハンドルを追加する。

```tsx
const [draggedId, setDraggedId] = useState<string | null>(null);

function handleDragStart(e: React.DragEvent, itemId: string) {
  e.dataTransfer.setData("text/plain", itemId);
  e.dataTransfer.effectAllowed = "move";
  setDraggedId(itemId);
}

function handleDragOver(e: React.DragEvent) {
  e.preventDefault();
}

function handleDrop(e: React.DragEvent, targetItemId: string) {
  e.preventDefault();
  const sourceId = e.dataTransfer.getData("text/plain");
  setDraggedId(null);
  if (!sourceId || sourceId === targetItemId) return;

  const currentOrder = items.map((i) => i.id);
  const sourceIndex = currentOrder.indexOf(sourceId);
  const targetIndex = currentOrder.indexOf(targetItemId);
  if (sourceIndex === -1 || targetIndex === -1) return;

  const reordered = [...currentOrder];
  reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, sourceId);

  startTransition(() => {
    reorderRequirementItems(projectId, chapterNo, reordered);
  });
}
```

行のレンダリング部分（各行の`<div>`）に、ドラッグ関連のイベントとハンドル要素を追加する。

```tsx
<div
  key={item.id}
  onDragOver={handleDragOver}
  onDrop={(e) => handleDrop(e, item.id)}
  className={`grid border-t border-[#F1F1EF] ${draggedId === item.id ? "opacity-40" : ""}`}
  style={{ gridTemplateColumns: `24px repeat(${columns.length}, 1fr) 100px 80px` }}
>
  <div
    draggable
    onDragStart={(e) => handleDragStart(e, item.id)}
    className="flex items-center justify-center cursor-grab text-faint"
    title="ドラッグして並び替え"
  >
    ⠿
  </div>
  {/* 既存の列・ステータス・操作の内容はそのまま続ける */}
</div>
```

**注意**：既存のヘッダー行の`gridTemplateColumns`にも、ハンドル用の`24px`を先頭に追加し、データ行と列数・幅を一致させること（ずれると列がかみ合わなくなる）。

## Step 2: 一括並び替え用のServer Actionを作成

`src/actions/requirement-items.ts`に追加する。

```ts
export async function reorderRequirementItems(
  projectId: string,
  chapterNo: number,
  orderedItemIds: string[]
) {
  const supabase = await createServerActionClient();

  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await supabase
      .from("requirement_items")
      .update({ order_index: i })
      .eq("id", orderedItemIds[i])
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo);
    if (error) throw error;
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

**注意**：`.eq("project_id", projectId).eq("chapter_no", chapterNo)`を必ず条件に含めること。前回の`moveRequirementItem`同様、対象外の項目を誤って巻き込まないための絞り込みであり、`orderedItemIds`にもし他章のIDが紛れ込んでいた場合でも、この条件により実害が生じないようにする防御的な実装とする。

`moveRequirementItem`（前回実装した▲▼用の関数）は、呼び出し元が無くなるため削除してよい（`grep -rn "moveRequirementItem"`で他に呼び出し箇所が無いことを確認してから削除すること）。

## Step 3: 動作確認

1. 複数項目がある章で、いずれかの行のドラッグハンドル（⠿）をつかんで、別の行の位置にドロップする
2. ドロップした位置に項目が移動することを確認する
3. ドラッグ中、つかんでいる行が半透明になる等、操作中であることが視覚的に分かることを確認する
4. ページをリロードしても、並び替えた順序が維持されていることを確認する
5. 確定済み項目もドラッグで並び替えられることを確認する（並び替えは内容編集とは無関係な操作のため）
6. 入力欄（テキストボックス）内でのテキスト選択・カーソル移動が、ドラッグハンドル追加によって妨げられていないことを確認する（ハンドルを分離したのはこのため）

## やってはいけないこと

- 行全体を`draggable`にしない（入力欄の選択・カーソル操作と競合するため、専用のハンドル要素のみを`draggable`にする）
- `moveRequirementItem`を削除する際、他に呼び出し箇所が無いことを確認せずに削除しない

## 完了条件

- [ ] ▲▼ボタンを削除し、ドラッグハンドルに置き換え済み
- [ ] `reorderRequirementItems`実装済み
- [ ] ドラッグ&ドロップでの並び替え・永続化が動作確認済み
- [ ] 入力欄の操作性が損なわれていないことを確認済み
