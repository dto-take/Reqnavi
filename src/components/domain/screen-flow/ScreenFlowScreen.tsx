"use client";

import { useMemo, useState, useTransition } from "react";
import { addScreenTransition, moveScreenNode, moveScreenNodes, type ScreenEdge, type ScreenNode } from "@/actions/screen-transition";
import { ScreenFlowCanvas, type FlowSelection } from "@/components/domain/screen-flow/ScreenFlowCanvas";
import { ScreenFlowPanel } from "@/components/domain/screen-flow/ScreenFlowPanel";
import { degrees, flowWarnings, nodePosition, type FunctionItem } from "@/lib/screen-flow/derive";
import { autoLayoutPositions } from "@/lib/screen-flow/layout";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// screen_flow_ux_phase1/2.md：キャンバス（主役）＋右パネルの2カラム構成のオーケストレータ。
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
  // ポートから作成した直後の遷移id。再取得データに現れるまで選択を解除しない（作成直後に
  // 選択・フォーカスが消えないようにする）。別の対象を選んだ時点で破棄する。
  const [pendingEdgeId, setPendingEdgeId] = useState<string | null>(null);
  const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null);
  const [posOverrides, setPosOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [, startTransition] = useTransition();
  const { show } = useToast();

  // 規約59：ドロップ/整列直後からサーバーの再取得データが届くまで、座標の上書き値を保持して
  // 元の位置へ一瞬戻らないようにする。実データが上書き値に追いついた分は、useEffectでの
  // 後片付けをせずレンダー計算の中で単純に無視する（規約54）。複数ノード分を保持できる。
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
  const confirmedCount = displayNodes.filter((n) => n.status === "confirmed").length;

  // 選択対象が削除等で存在しなくなった場合は未選択として扱う（作成直後の遷移は除く）
  const effectiveSelection: FlowSelection =
    selection?.type === "node" && !nodes.some((n) => n.id === selection.id)
      ? null
      : selection?.type === "edge" && !edges.some((e) => e.id === selection.id) && selection.id !== pendingEdgeId
        ? null
        : selection;

  function handleSelect(next: FlowSelection) {
    setSelection(next);
    setPendingEdgeId(null);
    setFocusEdgeId(null);
  }

  function setOverrides(entries: { id: string; x: number; y: number }[]) {
    setPosOverrides((prev) => {
      const next = new Map(prev);
      for (const e of entries) next.set(e.id, { x: e.x, y: e.y });
      return next;
    });
  }
  function clearOverrides(ids: string[]) {
    setPosOverrides((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  function handleMove(nodeId: string, x: number, y: number) {
    const pos = { id: nodeId, x: Math.round(x), y: Math.round(y) };
    setOverrides([pos]);
    handleSelect({ type: "node", id: nodeId });
    startTransition(async () => {
      try {
        await moveScreenNode(nodeId, projectId, pos.x, pos.y);
      } catch (e) {
        clearOverrides([nodeId]);
        show(errorMessage(e), "error");
      }
    });
  }

  function handleConnect(fromId: string, toId: string) {
    if (edges.some((e) => e.from_node === fromId && e.to_node === toId)) {
      show("既にこの遷移があります", "error");
      return;
    }
    startTransition(async () => {
      try {
        const id = await addScreenTransition(projectId, fromId, toId);
        setSelection({ type: "edge", id });
        setPendingEdgeId(id);
        setFocusEdgeId(id);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  // 自動で整列：座標は純粋関数（src/lib/screen-flow/layout.ts）で計算し、その結果を上書き値
  // として即時反映したうえで、まとめて保存する。失敗時は上書きを取り除いて元の位置へ戻す。
  function handleAutoLayout() {
    if (nodes.length === 0) return;
    if (!confirm("手動で配置した位置がすべて上書きされます。よろしいですか？")) return;
    const layout = autoLayoutPositions(nodes, edges);
    const moves = [...layout.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    setOverrides(moves);
    startTransition(async () => {
      try {
        await moveScreenNodes(projectId, moves);
      } catch (e) {
        clearOverrides(moves.map((m) => m.id));
        show(errorMessage(e), "error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          data-screen-flow-summary-confirmed
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
          style={{ borderColor: "var(--status-confirmed-text)", color: "var(--status-confirmed-text)", background: "var(--status-confirmed-bg)" }}
        >
          確定 {confirmedCount}/{displayNodes.length}
        </span>
        <span
          data-screen-flow-summary-warnings
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
          style={
            warnings.length > 0
              ? { borderColor: "var(--status-review-text)", color: "var(--status-review-text)", background: "var(--status-review-bg)" }
              : { borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-page)" }
          }
        >
          要確認 {warnings.length}
        </span>
        <button
          type="button"
          onClick={handleAutoLayout}
          disabled={displayNodes.length === 0}
          className="ml-auto text-[12px] font-medium px-3 py-2 rounded-md border border-border bg-page cursor-pointer hover:bg-hover whitespace-nowrap disabled:opacity-50"
        >
          自動で整列
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_316px] gap-0 items-start">
        <ScreenFlowCanvas
          nodes={displayNodes}
          edges={edges}
          functions={functions}
          degrees={deg}
          selection={effectiveSelection}
          onSelect={handleSelect}
          onMove={handleMove}
          onConnect={handleConnect}
        />
        <ScreenFlowPanel
          projectId={projectId}
          nodes={displayNodes}
          edges={edges}
          functions={functions}
          warnings={warnings}
          selection={effectiveSelection}
          focusEdgeId={focusEdgeId}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
