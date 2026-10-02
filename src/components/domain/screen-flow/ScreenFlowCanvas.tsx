"use client";

import { useRef, useState } from "react";
import type { ScreenEdge, ScreenNode } from "@/actions/screen-transition";
import {
  NODE_H,
  NODE_W,
  STAGE_H,
  STAGE_W,
  clampPosition,
  edgeGeometry,
  hasReverseEdge,
  isIsolated,
  nodePosition,
  type FunctionItem,
} from "@/lib/screen-flow/derive";

export type FlowSelection = { type: "node" | "edge"; id: string } | null;

const DOT_COLOR: Record<ScreenNode["status"], string> = {
  confirmed: "var(--status-confirmed-text)",
  se_reviewing: "var(--status-review-text)",
  ai_draft: "var(--text-faint)",
};

// screen_flow_ux_phase1.md Step3：キャンバス（自前SVG＋絶対配置のdiv。React Flow等は使わない）。
// 本フェーズでは等倍固定（ズームはフェーズ2）、接続ポートは表示のみ。
export function ScreenFlowCanvas({
  nodes,
  edges,
  functions,
  degrees,
  selection,
  onSelect,
  onMove,
}: {
  nodes: ScreenNode[];
  edges: ScreenEdge[];
  functions: FunctionItem[];
  degrees: Map<string, { in: number; out: number }>;
  selection: FlowSelection;
  onSelect: (selection: FlowSelection) => void;
  onMove: (nodeId: string, x: number, y: number) => void;
}) {
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => positions.set(n.id, dragPos?.id === n.id ? { x: dragPos.x, y: dragPos.y } : nodePosition(n, i)));
  const functionById = new Map(functions.map((f) => [f.id, f]));

  function handlePointerDown(e: React.PointerEvent, node: ScreenNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const pos = positions.get(node.id)!;
    dragRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };

    function finalPos(d: NonNullable<typeof dragRef.current>, ev: PointerEvent) {
      return clampPosition(d.origX + (ev.clientX - d.startX), d.origY + (ev.clientY - d.startY));
    }
    function handleMove(ev: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      // 3px未満の移動はクリック（選択）とみなす
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 3) return;
      d.moved = true;
      const c = finalPos(d, ev);
      setDragPos({ id: d.id, x: c.x, y: c.y });
    }
    function handleUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      if (d.moved) {
        const c = finalPos(d, ev);
        // 親が上書き値を保持してからドラッグ状態を消す（同一イベント内でバッチされ、
        // 元の位置に一瞬戻るちらつきが出ない。規約59）
        onMove(d.id, c.x, c.y);
        setDragPos(null);
      } else {
        onSelect({ type: "node", id: d.id });
      }
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  const selectedNodeId = selection?.type === "node" ? selection.id : null;
  const selectedEdgeId = selection?.type === "edge" ? selection.id : null;

  const geoms = edges.flatMap((e) => {
    const a = positions.get(e.from_node);
    const b = positions.get(e.to_node);
    if (!a || !b) return [];
    const isSel = e.id === selectedEdgeId;
    const hot = isSel || (selectedNodeId !== null && (e.from_node === selectedNodeId || e.to_node === selectedNodeId));
    return [{ edge: e, geom: edgeGeometry(a, b, hasReverseEdge(e, edges)), isSel, hot }];
  });

  return (
    <div
      className="overflow-auto rounded-lg border border-border"
      style={{
        maxHeight: 720,
        backgroundColor: "var(--bg-sidebar)",
        backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }} onPointerDown={() => onSelect(null)} data-screen-flow-stage>
        <svg width={STAGE_W} height={STAGE_H} className="absolute inset-0" style={{ overflow: "visible" }}>
          {geoms.map(({ edge, geom }) => (
            <path
              key={`hit-${edge.id}`}
              d={geom.d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelect({ type: "edge", id: edge.id });
              }}
            />
          ))}
          {geoms.map(({ edge, geom, isSel, hot }) => {
            const color = isSel ? "var(--text-primary)" : hot ? "var(--brand)" : "var(--text-faint)";
            return (
              <g key={edge.id} style={{ pointerEvents: "none" }}>
                <path d={geom.d} fill="none" stroke={color} strokeWidth={hot ? 2 : 1.5} />
                <path d={geom.arrow} fill={color} stroke="none" />
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const pos = positions.get(node.id)!;
          const selected = node.id === selectedNodeId;
          const isolated = isIsolated(node.id, degrees);
          const fn = node.function_item_id ? functionById.get(node.function_item_id) : undefined;
          return (
            <div
              key={node.id}
              data-screen-node={node.id}
              onPointerDown={(e) => handlePointerDown(e, node)}
              className="absolute flex flex-col gap-1 rounded-xl select-none"
              style={{
                left: pos.x,
                top: pos.y,
                width: NODE_W,
                height: NODE_H,
                boxSizing: "border-box",
                padding: selected ? "9px 11px" : "10px 12px",
                background: "var(--bg-page)",
                border: selected ? "2px solid var(--text-primary)" : "1px solid var(--border)",
                boxShadow: selected ? "0 6px 18px rgba(27,26,23,.14)" : "0 1px 2px rgba(27,26,23,.06)",
                cursor: dragPos?.id === node.id ? "grabbing" : "grab",
                zIndex: 2,
                touchAction: "none",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.75 h-1.75 rounded-full flex-none" style={{ background: DOT_COLOR[node.status] }} />
                <span className="font-mono text-[10px] text-faint">{node.screen_code ?? ""}</span>
                {isolated && (
                  <span className="ml-auto text-[9.5px] font-medium" style={{ color: "var(--status-needhearing-text)" }}>
                    ⚠ 孤立
                  </span>
                )}
              </div>
              <div className="text-[12.5px] font-bold leading-snug text-primary truncate">{node.label}</div>
              <div
                className="text-[10.5px] truncate"
                style={{ color: node.function_item_id ? "var(--brand)" : "var(--status-review-text)" }}
              >
                {node.function_item_id ? `9章 ${fn ? `${fn.code}：${fn.name}` : "紐付け済み"}` : "9章 未紐付け"}
              </div>
              <span
                aria-hidden
                className="absolute rounded-full"
                style={{
                  right: -8,
                  top: 27,
                  width: 16,
                  height: 16,
                  background: "var(--bg-page)",
                  border: "2px solid var(--brand)",
                  pointerEvents: "none",
                }}
              />
            </div>
          );
        })}

        {/* ラベルはノードより前面（指示書Step3）。クリックで遷移を選択する */}
        {geoms.map(({ edge, geom, isSel, hot }) => {
          const color = isSel ? "var(--text-primary)" : "var(--brand)";
          return (
            <div
              key={`label-${edge.id}`}
              data-screen-edge-label={edge.id}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelect({ type: "edge", id: edge.id });
              }}
              className="absolute text-[10.5px] font-medium whitespace-nowrap rounded-full cursor-pointer"
              style={{
                left: geom.lx,
                top: geom.ly,
                transform: "translate(-50%, -50%)",
                padding: "4px 8px",
                zIndex: 3,
                color: hot ? "var(--bg-page)" : edge.label ? "var(--text-secondary)" : "var(--text-faint)",
                background: hot ? color : "var(--bg-page)",
                border: `1px solid ${hot ? color : "var(--border)"}`,
              }}
            >
              {edge.label || "（操作名なし）"}
            </div>
          );
        })}

        {nodes.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-faint">
            まだ画面がありません。右のパネルから9章の画面を図に追加してください。
          </p>
        )}
      </div>
    </div>
  );
}
