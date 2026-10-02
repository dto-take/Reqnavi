"use client";

import { useMemo, useState, useTransition } from "react";
import { moveScreenNode, type ScreenEdge, type ScreenNode } from "@/actions/screen-transition";
import { ScreenFlowCanvas, type FlowSelection } from "@/components/domain/screen-flow/ScreenFlowCanvas";
import { ScreenFlowPanel } from "@/components/domain/screen-flow/ScreenFlowPanel";
import { degrees, flowWarnings, nodePosition, type FunctionItem } from "@/lib/screen-flow/derive";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// screen_flow_ux_phase1.md：キャンバス（主役）＋右パネルの2カラム構成のオーケストレータ。
// 業務フロー・KPI・非機能要件と同じ「page.tsxは薄いラッパー、ローカル状態はここ」の形。
export function ScreenFlowScreen({
  projectId,
  nodes,
  edges,
  functions,
}: {
  projectId: string;
  nodes: ScreenNode[];
  edges: ScreenEdge[];
  functions: FunctionItem[];
}) {
  const [selection, setSelection] = useState<FlowSelection>(null);
  const [posOverrides, setPosOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [, startTransition] = useTransition();
  const { show } = useToast();

  // 規約59：ドロップ直後からサーバーの再取得データが届くまで、座標の上書き値を保持して
  // 元の位置へ一瞬戻らないようにする。実データが上書き値に追いついた分は、useEffectでの
  // 後片付けをせずレンダー計算の中で単純に無視する（規約54）。
  const displayNodes = useMemo(() => {
    if (posOverrides.size === 0) return nodes;
    return nodes.map((n, i) => {
      const ov = posOverrides.get(n.id);
      if (!ov) return n;
      const real = nodePosition(n, i);
      if (real.x === ov.x && real.y === ov.y) return n;
      return { ...n, pos_x: ov.x, pos_y: ov.y };
    });
  }, [nodes, posOverrides]);

  const deg = useMemo(() => degrees(displayNodes, edges), [displayNodes, edges]);
  const warnings = useMemo(() => flowWarnings(displayNodes, edges), [displayNodes, edges]);

  // 選択対象が削除等で存在しなくなった場合は未選択として扱う
  const effectiveSelection: FlowSelection =
    selection?.type === "node" && !nodes.some((n) => n.id === selection.id)
      ? null
      : selection?.type === "edge" && !edges.some((e) => e.id === selection.id)
        ? null
        : selection;

  function handleMove(nodeId: string, x: number, y: number) {
    const pos = { x: Math.round(x), y: Math.round(y) };
    setPosOverrides((prev) => new Map(prev).set(nodeId, pos));
    setSelection({ type: "node", id: nodeId });
    startTransition(async () => {
      try {
        await moveScreenNode(nodeId, projectId, pos.x, pos.y);
      } catch (e) {
        setPosOverrides((prev) => {
          const next = new Map(prev);
          next.delete(nodeId);
          return next;
        });
        show(errorMessage(e), "error");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_316px] gap-0 items-start">
      <ScreenFlowCanvas
        nodes={displayNodes}
        edges={edges}
        functions={functions}
        degrees={deg}
        selection={effectiveSelection}
        onSelect={setSelection}
        onMove={handleMove}
      />
      <ScreenFlowPanel
        projectId={projectId}
        nodes={displayNodes}
        edges={edges}
        functions={functions}
        warnings={warnings}
        selection={effectiveSelection}
        onSelect={setSelection}
      />
    </div>
  );
}
