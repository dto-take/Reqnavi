# 指示書：ノードパレットのドラッグ&ドロップ対応・アクター選択肢の動的化

## 目的

1. ノードパレットからのノード追加を、クリックだけでなくドラッグ&ドロップでも行えるようにする
2. 右パネルの「アクター」欄を、既存の`role_lane`値を提案しつつ自由入力もできる形にする（新しい値を入力すれば、以降の選択肢としても使えるようになる）

## 前提確認

- 業務フロービルダー フェーズDが完了していること

---

## Step 1: パレットをドラッグ可能にする

`src/components/domain/workflow-builder/NodePalette.tsx`の各ボタンに、`draggable="true"`と`onDragStart`を追加する（RequirementTableの並び替え機能で確立済みのHTML5 Drag and Drop APIパターンを踏襲する）。

```tsx
<button
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData("text/plain", nodeType);
    e.dataTransfer.effectAllowed = "copy";
  }}
  onClick={() => handleInsert(nodeType)}
  className="..."
>
  {label}
</button>
```

## Step 2: キャンバス側をドロップ対象にする

`src/components/domain/workflow-builder/SwimlaneCanvas.tsx`の各カード・スタブに、ドロップ受け入れ処理を追加する。

```tsx
const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

function handleDragOver(e: React.DragEvent, targetId: string) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  setDragOverTarget(targetId);
}

function handleDragLeave() {
  setDragOverTarget(null);
}

function handleDrop(e: React.DragEvent, targetId: string) {
  e.preventDefault();
  const nodeType = e.dataTransfer.getData("text/plain");
  setDragOverTarget(null);
  if (!nodeType) return;
  onInsert(targetId, nodeType);
}
```

各カード・スタブの`<div>`に`onDragOver`・`onDragLeave`・`onDrop`を追加し、`dragOverTarget`と一致する要素にドロップ可能であることを示す視覚的フィードバック（枠線のハイライト等）を追加する。

**注意**：ドロップ先の`targetId`は、フェーズDで確立した「実ノードID」「スタブID（`stub:<conditionId>:<yes|no>`形式）」のいずれかであり、`insertWorkflowNodeAfter`が既にこの形式を受け付ける設計になっているはずなので、クリック時と同じ関数をそのまま呼び出せる。

## Step 3: アクター欄を動的な選択肢に変更

`src/components/domain/workflow-builder/NodeEditPanel.tsx`の「アクター」欄（現状`<select>`）を、`<input list="...">`+`<datalist>`に変更する。

```tsx
<input
  list="actor-options"
  value={actor}
  onChange={(e) => setActor(e.target.value)}
  onBlur={handleBlurSave}
  className="w-full h-9 border border-border rounded-md px-2 text-sm"
/>
<datalist id="actor-options">
  {actorOptions.map((a) => <option key={a} value={a} />)}
</datalist>
```

`actorOptions`（既存の`role_lane`値一覧）は、既存の取得ロジック（フェーズBで実装済みのはず）をそのまま使う。新しい値を入力して保存すると、次にページを開いた際（または`revalidatePath`後の再取得時）にその値も選択肢に自然に含まれるようになる（別途マスタ管理をする必要はない）。

## Step 4: 動作確認

1. パレットの「手動タスク」を、キャンバス上の既存カードにドラッグ&ドロップし、ドロップ先の直後に正しく挿入されることを確認する
2. スタブ（条件分岐のYes/No空欄）にドラッグ&ドロップし、正しくそのブランチに挿入されることを確認する
3. ドラッグ中、ドロップ可能な場所にカーソルを合わせると視覚的なフィードバック（枠線ハイライト等）が表示されることを確認する
4. 既存のクリックによる挿入も引き続き機能することを確認する
5. アクター欄で、新しい名前（例：「経理部長」）を入力して保存し、別のノードのアクター欄を開いたときに候補として表示されることを確認する
6. 既存のアクター名は引き続き候補一覧に表示されることを確認する

## やってはいけないこと

- ドラッグ&ドロップを追加する際、既存のクリックによる挿入方法を削除しない
- アクターの選択肢を管理する新しいテーブル（マスタテーブル）を追加しない

## 完了条件

- [ ] パレットのドラッグ&ドロップ対応済み
- [ ] キャンバス側のドロップ受け入れ・視覚的フィードバック実装済み
- [ ] アクター欄が`datalist`ベースの動的な選択肢に変更済み
- [ ] 動作確認済み
