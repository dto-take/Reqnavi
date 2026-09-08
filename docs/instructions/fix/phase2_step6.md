# 指示書：Phase2 Step6 画面遷移図・項目定義・外部IF定義

## 目的

機能要件（9章）の画面同士のつながりを画面遷移図として管理し、あわせて項目定義・外部IF定義を機能要件に追記できるようにする。「基本設計に準ずるところまで要件で整理する」という方針の具体化にあたる。詳細は `docs/01_requirements.md` §9（機能No.6）を参照。

## データモデルの方針

画面遷移図は、業務フロー（Phase2 Step1〜4）と同じ`flow_nodes`/`flow_edges`を`flow_type = 'screen_transition'`で使い回す。**ただし業務フローとは異なり、画面遷移は分岐・合流（1つの画面から複数画面へ、複数画面から1つの画面へ）を持つグラフになるため、`order_index`による自動並び替え・自動edge生成（`regenerateEdges`）は使わない。** 画面の追加とedge（遷移）の追加は、それぞれ独立した操作として行う。

## 前提確認

- Phase2 Step5（画面ワイヤーフレーム生成）が完了していること
- `flow_nodes`のCHECK制約（`flow_type`）に`screen_transition`が含まれていることを確認する（Phase2 Step1で定義済みのはず）。含まれていない場合は`alter table flow_nodes drop constraint ... add constraint ...`で追加すること

---

## Step 1: 項目定義・外部IF定義用の列を追加

```bash
supabase migration new seed_field_and_if_columns
```

```sql
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('C', 'field_definitions', '項目定義（例：顧客名:text:必須, 電話番号:text:任意）', 'text', 9),
  ('C', 'external_if',       '外部IF定義（連携先・データ項目・タイミング）', 'text', 10)
on conflict (template_type, column_key) do nothing;
```

`supabase db reset` で反映する。これらは`RequirementTable`が既存の仕組みでそのまま表示・編集できるため、コンポーネント側の変更は不要（CLAUDE.mdの「列定義データを追加するだけで対応する」方針通り）。

## Step 2: 画面遷移用のServer Actionsを作成

新規ファイル `src/actions/screen-transition.ts`。`business-flow.ts`とは独立したファイルとする（業務フローとはedge生成ロジックが異なるため）。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ScreenNode = { id: string; label: string; order_index: number };
export type ScreenEdge = { id: string; from_node: string; to_node: string; label: string | null };

export async function listScreenNodes(projectId: string): Promise<ScreenNode[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("id, label, order_index")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition")
    .order("order_index");
  if (error) throw error;
  return data;
}

export async function listScreenEdges(projectId: string): Promise<ScreenEdge[]> {
  const supabase = await createServerActionClient();
  const { data: nodes } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition");
  if (!nodes || nodes.length === 0) return [];

  const { data, error } = await supabase
    .from("flow_edges")
    .select("id, from_node, to_node, label")
    .in("from_node", nodes.map((n) => n.id));
  if (error) throw error;
  return data;
}

export async function addScreenNode(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { data: existing } = await supabase
    .from("flow_nodes")
    .select("order_index")
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition")
    .order("order_index", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

  const { error } = await supabase.from("flow_nodes").insert({
    project_id: projectId,
    tenant_id: tenantId,
    flow_type: "screen_transition",
    label: formData.get("label") as string,
    order_index: nextOrder,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}

export async function addScreenTransition(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("flow_edges").insert({
    from_node: formData.get("from_node") as string,
    to_node: formData.get("to_node") as string,
    label: formData.get("label") as string,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}

export async function deleteScreenNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  // flow_edgesはon delete cascadeが設定済み（Phase2 Step1で対応済み）のため、
  // ノード削除だけで関連edgeも自動的に削除される
  const { error } = await supabase.from("flow_nodes").delete().eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}
```

## Step 3: 画面遷移図コンポーネントを作成

新規ファイル `src/components/domain/screen-transition/ScreenTransitionDiagram.tsx`。分岐・合流を考慮し、ノードは追加順に単純に横一列へ配置する（座標を工夫した美しいレイアウトはこのStepでは対象外とし、線が交差する場合があることを許容する）。

```tsx
import type { ScreenNode, ScreenEdge } from "@/actions/screen-transition";

const NODE_WIDTH = 150;
const NODE_HEIGHT = 50;
const GAP_X = 60;
const TOP_MARGIN = 30;

export function ScreenTransitionDiagram({ nodes, edges }: { nodes: ScreenNode[]; edges: ScreenEdge[] }) {
  if (nodes.length === 0) {
    return <div className="text-sm text-secondary py-6 text-center">まだ画面がありません</div>;
  }

  const positions = new Map(nodes.map((n) => [n.id, { x: n.order_index * (NODE_WIDTH + GAP_X), y: TOP_MARGIN }]));
  const width = nodes.length * (NODE_WIDTH + GAP_X);
  const height = TOP_MARGIN * 2 + NODE_HEIGHT + 40; // 遷移ラベル用に余白を確保

  return (
    <svg width={width} height={height} className="border border-border rounded-lg">
      <defs>
        <marker id="arrow-screen" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10" fill="none" stroke="#9B9A97" strokeWidth="1.5" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const from = positions.get(edge.from_node);
        const to = positions.get(edge.to_node);
        if (!from || !to) return null;
        const midX = (from.x + NODE_WIDTH + to.x) / 2;
        return (
          <g key={edge.id}>
            <line
              x1={from.x + NODE_WIDTH} y1={from.y + NODE_HEIGHT / 2}
              x2={to.x} y2={to.y + NODE_HEIGHT / 2}
              stroke="#9B9A97" strokeWidth={1.5} markerEnd="url(#arrow-screen)"
            />
            {edge.label && (
              <text x={midX} y={from.y - 8} fontSize={11} fill="#787774" textAnchor="middle">
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {nodes.map((node) => {
        const pos = positions.get(node.id)!;
        return (
          <g key={node.id}>
            <rect x={pos.x} y={pos.y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} fill="#FFFFFF" stroke="#E9E9E7" />
            <text x={pos.x + 10} y={pos.y + 28} fontSize={13} fill="#37352F">{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
```

**注意**：分岐（1画面から複数画面への遷移）がある場合、複数のedgeが同じノードから出るため線が交差することがある。視認性が問題になった場合は、Phase2 Step3の`SwimlaneDiagramEditor`のようなドラッグ配置機能を別途追加することを検討するが、このStepでは対象外とする。

## Step 4: 画面遷移図ページを作成

新規ファイル `src/app/projects/[id]/chapters/9/screen-transitions/page.tsx`。

```tsx
import { listScreenNodes, listScreenEdges, addScreenNode, addScreenTransition, deleteScreenNode } from "@/actions/screen-transition";
import { ScreenTransitionDiagram } from "@/components/domain/screen-transition/ScreenTransitionDiagram";

export default async function ScreenTransitionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [nodes, edges] = await Promise.all([listScreenNodes(id), listScreenEdges(id)]);
  const addNode = addScreenNode.bind(null, id);
  const addTransition = addScreenTransition.bind(null, id);

  return (
    <div className="max-w-3xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">画面遷移図</h1>

      <div className="overflow-x-auto mb-6">
        <ScreenTransitionDiagram nodes={nodes} edges={edges} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <form action={addNode} className="flex gap-2">
          <input name="label" placeholder="画面名" required className="flex-1 h-9 border border-border rounded-md px-2 text-sm" />
          <button className="h-9 px-3 bg-primary text-white rounded-md text-sm">+ 画面追加</button>
        </form>

        <form action={addTransition} className="flex gap-2 items-center">
          <select name="from_node" required className="h-9 border border-border rounded-md text-sm flex-1">
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <span className="text-xs text-secondary">→</span>
          <select name="to_node" required className="h-9 border border-border rounded-md text-sm flex-1">
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <input name="label" placeholder="遷移条件" className="h-9 border border-border rounded-md px-2 text-sm w-24" />
          <button className="h-9 px-3 border border-border rounded-md text-sm">追加</button>
        </form>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {nodes.map((n) => (
          <div key={n.id} className="flex justify-between items-center text-sm py-1">
            <span>{n.label}</span>
            <form action={deleteScreenNode.bind(null, n.id, id)}>
              <button className="text-xs text-faint">削除</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 5: 動作確認

1. `/projects/{id}/chapters/9/screen-transitions` で「顧客一覧画面」「顧客詳細画面」「顧客編集画面」の3画面を追加する
2. 遷移を「顧客一覧画面→顧客詳細画面（詳細押下）」「顧客詳細画面→顧客編集画面（編集押下）」の2件追加する
3. 図に3つの画面ボックスと2本の矢印、遷移ラベルが表示されることを確認
4. 「顧客一覧画面→顧客編集画面」のような分岐（1画面から複数画面）も追加できることを確認し、線が交差しても表示自体は崩れないことを確認
5. `/projects/{id}/chapters/9` で、いずれかの機能要件項目に項目定義（例：`顧客名:text:必須, 電話番号:text:任意`）と外部IF定義を入力し、保存できることを確認
6. 画面を1件削除し、それに紐づくedgeも連動して削除される（Step1で修正した`on delete cascade`が機能している）ことを確認

## やってはいけないこと

- 業務フロー（`business_asis`/`business_tobe`）用の`regenerateEdges`ロジックを画面遷移に流用しない（分岐を破壊してしまうため）
- 項目定義・外部IF定義を専用の構造化エディタとして作り込まない（テンプレートCの列として、既存の`RequirementTable`にそのまま乗せる）

## 完了条件

- [ ] `field_definitions`・`external_if`列追加済み
- [ ] 画面遷移図（追加・分岐対応・削除）が動作確認済み
- [ ] 項目定義・外部IF定義が機能要件テーブル上で入力・保存できることを確認済み
