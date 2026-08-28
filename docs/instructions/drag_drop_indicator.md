# 指示書：ドラッグ&ドロップの挿入位置インジケーター追加

## 目的

前回実装したドラッグ&ドロップ並び替えに、「どこに差し込まれるか」を示す視覚的なインジケーター（挿入位置を示す線）を追加する。あわせて、これまで「対象行と入れ替える」という単純なロジックだったものを、「対象行の前/後に挿入する」という、ドラッグ&ドロップとして自然な動きに修正する。

## 前提確認

- ドラッグ&ドロップによる並び替え（前回Step）が完了していること

---

## Step 1: ドロップ位置の判定・表示用stateを追加

`src/components/domain/requirement-table/RequirementTable.tsx`に、ドラッグ中のホバー位置を追跡するstateを追加する。

```tsx
const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);

function handleDragOver(e: React.DragEvent, itemId: string) {
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const position = e.clientY < midpoint ? "before" : "after";
  setDropTarget({ id: itemId, position });
}

function handleDragEnd() {
  setDraggedId(null);
  setDropTarget(null);
}
```

## Step 2: 挿入位置に応じた並び替えロジックに修正

`handleDrop`を、「対象行と入れ替える」から「対象行の前/後に挿入する」ロジックに修正する。

```tsx
function handleDrop(e: React.DragEvent, targetItemId: string) {
  e.preventDefault();
  const sourceId = e.dataTransfer.getData("text/plain");
  const position = dropTarget?.position ?? "before";
  setDraggedId(null);
  setDropTarget(null);
  if (!sourceId || sourceId === targetItemId) return;

  const currentOrder = items.map((i) => i.id);
  const sourceIndex = currentOrder.indexOf(sourceId);
  if (sourceIndex === -1) return;

  const withoutSource = currentOrder.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetItemId);
  if (targetIndex === -1) return;

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  const reordered = [...withoutSource];
  reordered.splice(insertIndex, 0, sourceId);

  startTransition(() => {
    reorderRequirementItems(projectId, chapterNo, reordered);
  });
}
```

## Step 3: 挿入位置の線を表示する

各行の`<div>`に`position: relative`を追加し、`dropTarget`が自分の行を指している場合に、上端または下端に線を表示する。`onDragOver`のハンドラも紐付ける。

```tsx
<div
  key={item.id}
  onDragOver={(e) => handleDragOver(e, item.id)}
  onDrop={(e) => handleDrop(e, item.id)}
  className={`grid border-t border-[#F1F1EF] relative ${draggedId === item.id ? "opacity-40" : ""}`}
  style={{ gridTemplateColumns: `24px repeat(${columns.length}, 1fr) 100px 80px` }}
>
  {dropTarget?.id === item.id && (
    <div
      className={`absolute left-0 right-0 h-0.5 bg-brand pointer-events-none ${
        dropTarget.position === "before" ? "top-0" : "bottom-0"
      }`}
    />
  )}
  {/* 既存のハンドル・列・ステータス・操作の内容はそのまま続ける */}
</div>
```

ドラッグハンドル要素（`draggable`が付いている`⠿`の`<div>`）に`onDragEnd={handleDragEnd}`を追加する。**`dragend`イベントはドラッグされている要素自身（＝ハンドル）で発火するため、行の`<div>`側に付けても発火しない点に注意すること。**

## Step 4: 動作確認

1. 行をドラッグし、別の行の上半分にカーソルを合わせたとき、その行の**上端**に線が表示されることを確認する
2. 同じ行の下半分にカーソルを合わせたとき、線が**下端**に移動することを確認する
3. 線が表示されている位置にドロップし、実際にその位置（前/後）に挿入されることを確認する
4. ドラッグを中断（画面外でマウスを離す等）した場合、線が消えて元の状態に戻ることを確認する（`handleDragEnd`のクリーンアップ確認）
5. 前回同様、確定済み項目も対象にでき、リロード後も順序が維持されることを確認する

## やってはいけないこと

- 挿入位置の線を、ドラッグ中でない通常時にも表示したままにしない（`dropTarget`が対応する行のときのみ表示する）
- `handleDragEnd`を適切な要素（ドラッグハンドル自身）に付けず、線が消えないまま残る状態を放置しない

## 完了条件

- [ ] ドロップ位置（前/後）の判定・線の表示実装済み
- [ ] 「入れ替え」から「挿入」ロジックへの修正済み
- [ ] 動作確認済み（線の表示・消去・実際の挿入位置の一致）
