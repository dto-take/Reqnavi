# 指示書：Phase2 Step3 業務フロー ドラッグ&ドロップ編集

## 目的

Phase2 Step2の読み取り専用スイムレート図を、ノードのドラッグ操作で担当者レーンの変更・順序の入れ替えができるようにする。詳細は `docs/01_requirements.md` §9（機能No.5）を参照。

## 前提確認

- Phase2 Step2（業務フロー可視化）が完了していること

---

## Step 1: 並び替え・レーン変更用のServer Actionを作成

`src/actions/business-flow.ts`に以下を追加する。既存の`regenerateEdges`（非export）はこのファイル内から呼び出せるためそのまま利用する。

```ts
export async function moveFlowStep(
  stepId: string,
  projectId: string,
  flowType: FlowType,
  newRoleLane: string,
  orderedStepIds: string[]
) {
  const supabase = await createServerActionClient();

  const { error: laneError } = await supabase
    .from("flow_nodes")
    .update({ role_lane: newRoleLane })
    .eq("id", stepId);
  if (laneError) throw laneError;

  for (let i = 0; i < orderedStepIds.length; i++) {
    const { error } = await supabase
      .from("flow_nodes")
      .update({ order_index: i })
      .eq("id", orderedStepIds[i]);
    if (error) throw error;
  }

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}
```

**注意**：ループで1件ずつUPDATEしているため、ステップ数が多い案件ではリクエスト数が増える。パフォーマンス上の懸念が出た場合は、`upsert`によるバルク更新への変更を検討するが、このStepでは実装の分かりやすさを優先する。

## Step 2: ドラッグ可能なSVGコンポーネントを作成

Phase2 Step2の`SwimlaneDiagram`（読み取り専用）とは別に、新規ファイル `src/components/domain/business-flow/SwimlaneDiagramEditor.tsx` を作成する（既存の読み取り専用版は変更しない。使い分けは呼び出し元で行う）。

```tsx
"use client";

import { useState, useTransition } from "react";
import { moveFlowStep } from "@/actions/business-flow";
import { computeSwimlaneLayout, LAYOUT_CONSTANTS } from "@/lib/business-flow/layout";
import type { FlowStep, FlowEdge, FlowType } from "@/actions/business-flow";

const { LANE_HEIGHT, STEP_WIDTH, STEP_HEIGHT } = LAYOUT_CONSTANTS;

export function SwimlaneDiagramEditor({
  projectId,
  flowType,
  steps,
  edges,
}: {
  projectId: string;
  flowType: FlowType;
  steps: FlowStep[];
  edges: FlowEdge[];
}) {
  const layout = computeSwimlaneLayout(steps);
  const [positions, setPositions] = useState(() => new Map(layout.positions));
  const [isPending, startTransition] = useTransition();

  function handlePointerDown(e: React.PointerEvent<SVGGElement>, stepId: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = positions.get(stepId)!;

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(stepId, { x: orig.x + dx, y: orig.y + dy });
        return next;
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      commitMove(stepId);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function commitMove(stepId: string) {
    const pos = positions.get(stepId);
    if (!pos) return;

    const laneIdx = Math.max(0, Math.min(layout.lanes.length - 1, Math.round((pos.y - 20) / LANE_HEIGHT)));
    const newLane = layout.lanes[laneIdx];

    const ordered = steps
      .map((s) => ({ id: s.id, x: s.id === stepId ? pos.x : (positions.get(s.id)?.x ?? 0) }))
      .sort((a, b) => a.x - b.x)
      .map((s) => s.id);

    startTransition(() => {
      moveFlowStep(stepId, projectId, flowType, newLane, ordered);
    });
  }

  return (
    <svg width={layout.width} height={layout.height} className="border border-border rounded-lg">
      {layout.lanes.map((lane, i) => (
        <g key={lane}>
          <rect x={0} y={i * LANE_HEIGHT} width={layout.width} height={LANE_HEIGHT} fill={i % 2 === 0 ? "#FBFBFA" : "#FFFFFF"} />
          <text x={12} y={i * LANE_HEIGHT + LANE_HEIGHT / 2} fontSize={12} fill="#787774">{lane}</text>
        </g>
      ))}

      <defs>
        <marker id="arrow-editor" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10" fill="none" stroke="#9B9A97" strokeWidth="1.5" />
        </marker>
      </defs>

      {edges.map((edge, i) => {
        const from = positions.get(edge.from_node);
        const to = positions.get(edge.to_node);
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
            markerEnd="url(#arrow-editor)"
          />
        );
      })}

      {steps.map((step) => {
        const pos = positions.get(step.id);
        if (!pos) return null;
        return (
          <g
            key={step.id}
            onPointerDown={(e) => handlePointerDown(e, step.id)}
            style={{ cursor: isPending ? "wait" : "grab" }}
          >
            <rect x={pos.x} y={pos.y} width={STEP_WIDTH} height={STEP_HEIGHT} rx={8} fill="#FFFFFF" stroke="#E9E9E7" />
            <text x={pos.x + 10} y={pos.y + 20} fontSize={13} fill="#37352F">{step.label}</text>
            {step.system_used && (
              <text x={pos.x + 10} y={pos.y + 38} fontSize={11} fill="#9B9A97">{step.system_used}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
```

**注意（要検証・不確実な箇所）**：`positions`はコンポーネントマウント時の`useState`初期値としてのみ計算される。ドラッグ確定後、サーバー側で`order_index`/`role_lane`が更新され`revalidatePath`が走ってページの`steps`/`edges`propsは更新されるはずだが、**Reactの`useState`はprops変更だけでは再初期化されない**ため、確定後に表示上の位置がサーバー側の正しい状態とズレる可能性がある。動作確認時にこの不整合が見られた場合は、呼び出し側（Step3）で以下のように`key`にステップの状態を含め、変更があった際にコンポーネントを強制的に再マウントさせる対応を検討すること。

```tsx
<SwimlaneDiagramEditor
  key={steps.map((s) => `${s.id}:${s.order_index}:${s.role_lane}`).join(",")}
  projectId={id} flowType={flowType} steps={steps} edges={edges}
/>
```

## Step 3: 業務フロー画面で編集版に切り替え

`src/app/projects/[id]/business-flow/page.tsx`の`SwimlaneDiagram`（読み取り専用）を`SwimlaneDiagramEditor`に置き換える。上記の`key`指定も併せて適用する。

## Step 4: 動作確認

1. `/projects/{id}/business-flow?tab=asis` で、いずれかのステップをドラッグして**別の担当者レーンへ移動**させる
2. ドロップ後、そのステップの`role_lane`が変わっていることをStudioで確認
3. いずれかのステップを**左右にドラッグして順序を変更**する
4. ドロップ後、`order_index`が新しい並びに応じて再採番されていることを確認
5. `flow_edges`が新しい順序に沿って再接続されていることを確認（Step1の`regenerateEdges`ロジックがそのまま機能しているか）
6. ドラッグ確定後の表示が、リロード後の表示と一致していることを確認（Step2で指摘した`useState`の再初期化タイミングに問題が無いか）

## やってはいけないこと

- ドラッグ操作で新しいレーン（存在しない担当者）を作成できるようにしない（既存レーンへの移動のみ許可する。新しい担当者の追加はStep1のテキスト入力フォームから行う）
- `moveFlowStep`実行のたびに`flow_edges`を再生成する処理を省略しない（省略すると図の見た目とデータの実態がずれる）

## 完了条件

- [ ] `moveFlowStep`実装済み
- [ ] `SwimlaneDiagramEditor`でドラッグによるレーン変更・順序変更が動作確認済み
- [ ] ドラッグ確定後の表示とリロード後の表示が一致することを確認済み（不一致があれば`key`による再マウント対応を実施済み）
