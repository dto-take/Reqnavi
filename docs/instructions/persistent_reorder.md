# 指示書：AI生成結果の表示順の入れ替え（永続化）

## 目的

前回実装した一時的な並び替え（クリックでソート、リロードでリセット）を、**行の表示順（`order_index`）を実際に入れ替えて保存する機能**に置き換える。AIが生成した複数の項目の順序を、SEが意味のある順番に並べ直せるようにする。

## 前提確認

- 前回の並び替え（列見出しクリックによる一時ソート）が実装済みであること

---

## Step 1: 前回の一時的な並び替えを削除

`src/components/domain/requirement-table/RequirementTable.tsx`から、前回追加した以下を削除する。

- `sortKey`/`sortDir`のstate
- `sortedItems`の`useMemo`
- `toggleSort`関数
- ヘッダーの`<button onClick={() => toggleSort(...)}>`化（通常の見出し表示に戻す）

`items.map(...)`を直接使う元の実装に戻す。

## Step 2: 順序入れ替えのServer Actionを作成

`src/actions/requirement-items.ts`に追加する。

```ts
export async function moveRequirementItem(
  projectId: string,
  chapterNo: number,
  itemId: string,
  direction: "up" | "down"
) {
  const supabase = await createServerActionClient();

  const { data: items, error } = await supabase
    .from("requirement_items")
    .select("id, order_index")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .order("order_index");
  if (error) throw error;
  if (!items) return;

  const currentIndex = items.findIndex((i) => i.id === itemId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= items.length) return;

  const reordered = [...items];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];

  for (let i = 0; i < reordered.length; i++) {
    const { error: updateError } = await supabase
      .from("requirement_items")
      .update({ order_index: i })
      .eq("id", reordered[i].id);
    if (updateError) throw updateError;
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

**注意**：既存の項目の`order_index`が全件0のまま（Phase1 Step2の`createRequirementItem`・AI素案生成のいずれも明示的な採番をしていなかった場合）だと、最初の並び替え操作をした時点で初めてDB上の順序が意味を持つようになる。既存データに対して初回実行時、想定と異なる並びから始まる可能性がある点に注意すること。

## Step 3: RequirementTableに上下移動ボタンを追加

`src/components/domain/requirement-table/RequirementTable.tsx`に、行ごとの上下移動ボタンを追加する。

```tsx
import { moveRequirementItem } from "@/actions/requirement-items";
// ...

function handleMove(item: RequirementItem, direction: "up" | "down") {
  startTransition(() => {
    moveRequirementItem(projectId, chapterNo, item.id, direction);
  });
}
```

各行の操作列（確定・例外承認ボタン等がある箇所）に追加する。

```tsx
<div className="flex flex-col">
  <button
    disabled={isPending}
    onClick={() => handleMove(item, "up")}
    className="text-[10px] text-faint hover:text-primary leading-none"
    aria-label="上に移動"
  >
    ▲
  </button>
  <button
    disabled={isPending}
    onClick={() => handleMove(item, "down")}
    className="text-[10px] text-faint hover:text-primary leading-none"
    aria-label="下に移動"
  >
    ▼
  </button>
</div>
```

## Step 4: 動作確認

1. 複数項目がある章で、いずれかの行の「▲」を押し、1つ上の行と入れ替わることを確認する
2. 「▼」を押して逆方向にも入れ替わることを確認する
3. ページをリロードしても、入れ替えた順序が維持されていることを確認する（`order_index`が実際にDBに保存されているかの確認）
4. 先頭の行で「▲」、末尾の行で「▼」を押しても、エラーにならず何も起きないことを確認する
5. 並べ替え後も、確定・例外承認・削除等の既存操作が正しい項目に対して実行されることを確認する

## やってはいけないこと

- 順序入れ替えの処理で、対象章・対象案件以外の項目の`order_index`まで巻き込んで変更しない（`eq("chapter_no", chapterNo)`の絞り込みを必ず維持する）
- 前回の一時的なソート機能をコード内に残したまま、今回の永続的な入れ替え機能を重複して実装しない（Step1で明確に置き換える）

## 完了条件

- [ ] 前回の一時的なソート機能の削除済み
- [ ] `moveRequirementItem`実装済み
- [ ] 上下移動ボタンで順序が入れ替わり、リロード後も維持されることを確認済み
