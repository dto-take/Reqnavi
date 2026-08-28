# 指示書：Phase2 Step2 業務フロー可視化（スイムレート図）

## 目的

Phase2 Step1で作った構造化データ（担当者・処理内容・使用システム・順序）から、担当者ごとのレーンに分けたスイムレート図をSVGで自動描画する。**このStepはまだ読み取り専用**（ドラッグ編集はStep3）。詳細は `docs/01_requirements.md` §9（機能No.5）を参照。

## 前提確認

- Phase2 Step1（業務フロー データモデル・テキスト入力）が完了していること

---

## Step 1: レイアウト計算ロジックを作成

新規ファイル `src/lib/business-flow/layout.ts`（`"use server"`を付けない通常モジュール。CLAUDE.md規約17）。

```ts
import type { FlowStep } from "@/actions/business-flow";

const LANE_HEIGHT = 90;
const STEP_WIDTH = 160;
const STEP_HEIGHT = 50;
const STEP_GAP_X = 40;
const LANE_LABEL_WIDTH = 110;
const TOP_MARGIN = 20;

export type FlowLayout = {
  lanes: string[];
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
};

export function computeSwimlaneLayout(steps: FlowStep[]): FlowLayout {
  const lanes = Array.from(new Set(steps.map((s) => s.role_lane ?? "未分類")));
  const laneIndex = new Map(lanes.map((l, i) => [l, i]));

  const positions = new Map<string, { x: number; y: number }>();
  for (const step of steps) {
    const x = LANE_LABEL_WIDTH + step.order_index * (STEP_WIDTH + STEP_GAP_X);
    const y = (laneIndex.get(step.role_lane ?? "未分類") ?? 0) * LANE_HEIGHT + TOP_MARGIN;
    positions.set(step.id, { x, y });
  }

  const maxOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.order_index)) : 0;
  const width = LANE_LABEL_WIDTH + (maxOrder + 1) * (STEP_WIDTH + STEP_GAP_X);
  const height = lanes.length * LANE_HEIGHT + TOP_MARGIN * 2;

  return { lanes, positions, width, height };
}

export const LAYOUT_CONSTANTS = { LANE_HEIGHT, STEP_WIDTH, STEP_HEIGHT, LANE_LABEL_WIDTH };
```

## Step 2: flow_edges取得用のServer Actionを追加

`src/actions/business-flow.ts`に以下を追加する。

```ts
export type FlowEdge = { from_node: string; to_node: string };

export async function listFlowEdges(projectId: string, flowType: FlowType): Promise<FlowEdge[]> {
  const supabase = await createServerActionClient();
  const { data: nodeIds } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", flowType);
  if (!nodeIds || nodeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("flow_edges")
    .select("from_node, to_node")
    .in("from_node", nodeIds.map((n) => n.id));
  if (error) throw error;
  return data;
}
```

## Step 3: SVG描画コンポーネントを作成

新規ファイル `src/components/domain/business-flow/SwimlaneDiagram.tsx`。デザイントークン（Phase0 Step1で確立したもの）に沿った配色にする。

```tsx
import { computeSwimlaneLayout, LAYOUT_CONSTANTS } from "@/lib/business-flow/layout";
import type { FlowStep, FlowEdge } from "@/actions/business-flow";

const { LANE_HEIGHT, STEP_WIDTH, STEP_HEIGHT, LANE_LABEL_WIDTH } = LAYOUT_CONSTANTS;

export function SwimlaneDiagram({ steps, edges }: { steps: FlowStep[]; edges: FlowEdge[] }) {
  if (steps.length === 0) {
    return <div className="text-sm text-secondary py-6 text-center">まだステップがありません</div>;
  }

  const layout = computeSwimlaneLayout(steps);
  const positionOf = (id: string) => layout.positions.get(id)!;

  return (
    <svg width={layout.width} height={layout.height} className="border border-border rounded-lg">
      {/* レーン背景（1つおきに色を変える） */}
      {layout.lanes.map((lane, i) => (
        <g key={lane}>
          <rect
            x={0}
            y={i * LANE_HEIGHT}
            width={layout.width}
            height={LANE_HEIGHT}
            fill={i % 2 === 0 ? "#FBFBFA" : "#FFFFFF"}
          />
          <text x={12} y={i * LANE_HEIGHT + LANE_HEIGHT / 2} fontSize={12} fill="#787774">
            {lane}
          </text>
        </g>
      ))}

      {/* 矢印マーカー定義 */}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10" fill="none" stroke="#9B9A97" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* エッジ（ステップ間の矢印） */}
      {edges.map((edge, i) => {
        const from = positionOf(edge.from_node);
        const to = positionOf(edge.to_node);
        if (!from || !to) return null;
        return (
          <line
            key={i}
            x1={from.x + STEP_WIDTH}
            y1={from.y + STEP_HEIGHT / 2}
            x2={to.x}
            y2={to.y + STEP_HEIGHT / 2}
            stroke="#9B9A97"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        );
      })}

      {/* ステップボックス */}
      {steps.map((step) => {
        const pos = positionOf(step.id);
        return (
          <g key={step.id}>
            <rect
              x={pos.x}
              y={pos.y}
              width={STEP_WIDTH}
              height={STEP_HEIGHT}
              rx={8}
              fill="#FFFFFF"
              stroke="#E9E9E7"
            />
            <text x={pos.x + 10} y={pos.y + 20} fontSize={13} fill="#37352F">
              {step.label}
            </text>
            {step.system_used && (
              <text x={pos.x + 10} y={pos.y + 38} fontSize={11} fill="#9B9A97">
                {step.system_used}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
```

**注意**：ステップ数が多い案件では`width`が非常に大きくなる可能性がある。このStepでは横スクロールで対応する前提とし、折り返しレイアウトは対象外とする（必要になった場合は別Stepで対応を検討する）。

## Step 4: 業務フロー画面に図を追加

`src/app/projects/[id]/business-flow/page.tsx`を更新し、リスト表示の上に図を追加する。

```tsx
import { listFlowSteps, listFlowEdges, addFlowStep, deleteFlowStep, type FlowType } from "@/actions/business-flow";
import { SwimlaneDiagram } from "@/components/domain/business-flow/SwimlaneDiagram";

// ...
export default async function BusinessFlowPage(/* 既存のprops */) {
  // ...既存のsteps取得に続けて
  const edges = await listFlowEdges(id, flowType);

  return (
    <div className="max-w-4xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      {/* 既存のタブ部分はそのまま */}

      <div className="overflow-x-auto mb-6">
        <SwimlaneDiagram steps={steps} edges={edges} />
      </div>

      {/* 既存のフォーム・リスト部分はそのまま */}
    </div>
  );
}
```

## Step 5: 動作確認

1. `/projects/{id}/business-flow?tab=asis` にアクセスし、担当者が異なる3〜4ステップが登録済みであることを確認（Step1で追加したデータを使う）
2. 担当者ごとにレーンが分かれ、背景色が交互に変わって表示されることを確認
3. ステップ間が矢印で接続されていることを確認
4. 使用システムが入力されている場合、ボックス内に小さく表示されることを確認
5. `?tab=tobe`でも同様に、独立した図が表示されることを確認
6. ステップが1件も無い場合、「まだステップがありません」の文言が表示され、エラーにならないことを確認

## やってはいけないこと

- このStepでノードのドラッグ移動・クリック編集機能を実装しない（読み取り専用に留める）
- `pos_x`/`pos_y`列を使った座標保存をこのStepで行わない（Step3のドラッグ編集で正式に使う）

## 完了条件

- [ ] レイアウト計算ロジック実装済み
- [ ] `listFlowEdges`追加済み
- [ ] `SwimlaneDiagram`コンポーネント実装済み
- [ ] As-Is/To-Be両方で図が正しく表示されることを確認済み
