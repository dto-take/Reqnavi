# 指示書：KPI画面UX改善 フェーズ2（確定ワークフロー）

## 目的

KPIノードに「下書き／要レビュー／確定済み」の状態と、「確定して次へ」による確定+自動遷移を実装する。

## 重要な設計判断：新しいステータス概念は作らない

デザインハンドオフは`draft`/`review`/`confirmed`の3状態を提案しているが、これは既存の`requirement_items.status`列（`ai_draft`/`se_reviewing`/`confirmed`/`exception_approved`/`rejected`）でそのまま表現できる。新しい列・enumは追加しない。

- 下書き（draft）＝`ai_draft`
- 要レビュー（review）＝`se_reviewing`
- 確定済み（confirmed）＝`confirmed`

ロック（編集不可）判定も、既存の`src/lib/item-lock.ts`の`isItemLocked`をそのまま使う。

## 前提確認

- KPI画面UX改善 フェーズ1（データモデル拡張・2ペインレイアウト）が完了していること

---

## Step 1: 手動追加ノードの初期ステータスを見直す

`src/actions/kpi-tree.ts`の`createKpiNode`で、新規作成時のステータスを`se_reviewing`にする。

```ts
.insert({
  status: "se_reviewing",
})
```

`generateKpiDraft`（AI生成）側は既存通り`status: "ai_draft"`のままでよい。

## Step 2: 編集時にステータスを自動的に「要レビュー」へ引き上げる

`updateKpiNodeField`を修正し、`ai_draft`状態のノードが編集された場合、`se_reviewing`に自動的に引き上げる。同時に、`isItemLocked`の場合は編集自体を拒否する。

```ts
export async function updateKpiNodeField(
  nodeId: string,
  projectId: string,
  field: "text" | "metric" | "owner" | "due_date",
  value: string
) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("content, status")
    .eq("id", nodeId)
    .single();
  if (fetchError || !current) throw fetchError ?? new Error("項目が見つかりません");

  if (isItemLocked(current.status)) {
    throw new Error("確定済みの項目は編集できません");
  }

  const newContent = { ...(current.content as object), [field]: value };
  const newStatus = current.status === "ai_draft" ? "se_reviewing" : current.status;

  const { error } = await supabase
    .from("requirement_items")
    .update({ content: newContent, status: newStatus })
    .eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}
```

## Step 3: 確定用Server Actionを追加

```ts
export async function confirmKpiNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "confirmed" })
    .eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}
```

## Step 4: 「表示中ツリーの次のノード」を計算するロジックを追加

`src/components/domain/kpi-tree/KpiTree.tsx`に、折りたたみ状態を反映した「表示中の平坦なノード順序」を計算する処理を追加する。

```ts
function getVisibleFlatList(nodes: KpiNode[], collapsedIds: Set<string>): KpiNode[] {
  // 深さ優先で辿り、折りたたまれているノードの子孫は含めない
}

function getNextVisibleId(flatList: KpiNode[], currentId: string): string | null {
  const idx = flatList.findIndex((n) => n.id === currentId);
  return idx >= 0 && idx < flatList.length - 1 ? flatList[idx + 1].id : null;
}
```

`KpiTreePane`にこの平坦リストを渡し、「N / M件目」の表示にも使う。

## Step 5: 「確定して次へ」を編集ペインに実装

`src/components/domain/kpi-tree/KpiDetailPane.tsx`のフッターに、ステータスに応じたボタンを実装する。

- **未確定（`ai_draft`/`se_reviewing`）**：primaryボタン「確定して次へ」。押すと`confirmKpiNode`を呼び、その後`getNextVisibleId`で次のノードを選択状態にする
- **確定済み（`confirmed`）**：「✓ 確定済」の静的表示に切り替える

編集ペイン全体を、`isItemLocked(selectedNode.status)`の場合は編集不可・非表示にする。

## Step 6: ツリーの状態ドット・「未確定N」ピルを正確にする

`KpiTreePane.tsx`の各ツリー行に、ステータスに応じた色のドットを表示する（確定＝緑／要レビュー＝琥珀／下書き＝グレー）。

構造ペインヘッダーの「未確定N」ピルを、実際に`status !== 'confirmed'`のノード数でカウントする。

## Step 7: 動作確認

1. AI生成直後のノードが「下書き」（グレードット）で表示されることを確認する
2. ノードの本文を編集すると、「要レビュー」（琥珀ドット）に自動的に切り替わることを確認する
3. 手動で追加したノードが、最初から「要レビュー」状態で作成されることを確認する
4. 「確定して次へ」を押すと、そのノードが「確定済み」になり、表示中の次のノードが自動的に選択されることを確認する
5. 確定済みノードを選択すると、編集ペインの各フィールドが編集不可になることを確認する
6. 「未確定N」ピルが、実際の未確定件数と一致することを確認する
7. 全ノードを確定すると、最後の「確定して次へ」後に選択が解除される（または適切な終了状態になる）ことを確認する

## やってはいけないこと

- 新しいステータス列・enumを追加しない
- 確定済みノードの編集を許可する経路を残さない
- AI候補生成・キーボード操作/並べ替えを本フェーズで実装しない

## 完了条件

- [ ] 手動追加ノードの初期ステータス変更済み
- [ ] 編集時の自動ステータス引き上げ・ロック時の編集拒否実装済み
- [ ] `confirmKpiNode`実装済み
- [ ] 「表示中の次のノード」計算・自動遷移実装済み
- [ ] ツリーの状態ドット・「未確定N」ピルの正確な反映済み
- [ ] 動作確認済み
