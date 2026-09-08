# 指示書：業務フロービルダー 最小限のノード追加機能（動作確認用の暫定対応）

## 目的

フェーズA+Bでは編集機能のみを実装し、ノードの追加手段（パレット）はフェーズD送りにしたため、空の状態から一切操作できない。フェーズDの本格的なパレットを待たず、**動作確認ができる最小限の追加機能**を暫定的に用意する。

## スコープの限定

- 本線（`branch='main'`）の末尾に工程を追加する機能のみとする
- 条件分岐ノードの追加、Yes/Noルートへの追加、挿入位置の指定は対象外とする（フェーズDで対応）
- ノード種別は「手動タスク」固定で追加し、種別変更は右パネルの編集フォームで行う想定とする

## 前提確認

- 業務フロービルダー フェーズA+Bが完了していること

---

## Step 1: 末尾追加のServer Actionを作成

`src/actions/workflow-builder.ts`に追加する。

```ts
export async function appendWorkflowNode(projectId: string, tenantId: string) {
  const supabase = await createServerActionClient();

  const { data: mainNodes } = await supabase
    .from("flow_nodes")
    .select("order_index, role_lane")
    .eq("project_id", projectId)
    .eq("flow_type", "business_builder")
    .eq("branch", "main")
    .order("order_index", { ascending: false })
    .limit(1);

  const nextOrderIndex = (mainNodes?.[0]?.order_index ?? -1) + 1;
  const defaultLane = mainNodes?.[0]?.role_lane ?? "担当者";

  const { data, error } = await supabase
    .from("flow_nodes")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      flow_type: "business_builder",
      node_type: "task",
      label: "新しい工程",
      role_lane: defaultLane,
      branch: "main",
      parent_condition_id: null,
      order_index: nextOrderIndex,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("工程の追加に失敗しました");

  revalidatePath(`/projects/${projectId}/business-flow/builder`);
  return data.id;
}
```

## Step 2: 画面にボタンを追加

`/projects/[id]/business-flow/builder`のページに、キャンバス下部（または空状態の中央）に追加ボタンを設置する。

```tsx
<form action={async () => { "use server"; await appendWorkflowNode(id, tenantId); }}>
  <SubmitButton variant="secondary" size="sm" pendingText="追加中...">
    + 本線の末尾に工程を追加
  </SubmitButton>
</form>
```

**注意**：`tenantId`はページのServer Component側で`getTenantId()`により取得し、渡すこと。

## Step 3: 動作確認

1. 業務フロービルダーが0件の状態で「+ 本線の末尾に工程を追加」を押し、「新しい工程」というラベルのカードが1件作成されることを確認する
2. 続けて数回押し、本線に複数のカードが順番に並ぶことを確認する
3. 作成したカードをクリックし、右パネルの編集フォームで内容を編集できることを確認する
4. 種別を「条件分岐」に変更し、右パネルに分岐ルールUIが表示されることを確認する

## やってはいけないこと

- 本格的なパレット（フェーズD）の実装を先取りしすぎない（本線末尾への単純追加のみに留める）

## 完了条件

- [ ] `appendWorkflowNode`実装済み
- [ ] 画面に追加ボタン設置済み
- [ ] 動作確認済み（追加→編集の一連の流れ）
