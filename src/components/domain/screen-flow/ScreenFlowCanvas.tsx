"use client";

import { useRef, useState } from "react";
import type { ScreenEdge, ScreenNode } from "@/actions/screen-transition";
import {
  NODE_H,
  NODE_W,
  clampPosition,
  edgeGeometry,
  hasReverseEdge,
  isIsolated,
  nodePosition,
  stageSizeFor,
  type FunctionItem,
  type StageSize,
} from "@/lib/screen-flow/derive";
import { isItemLocked } from "@/lib/item-lock";

export type FlowSelection = { type: "node" | "edge"; id: string } | null;

const DOT_COLOR: Record<ScreenNode["status"], string> = {
  confirmed: "var(--status-confirmed-text)",
  se_reviewing: "var(--status-review-text)",
  ai_draft: "var(--text-faint)",
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;

type DragState = {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
  stage: StageSize;
};

// screen_flow_ux_phase1/2.md：キャンバス（自前SVG＋絶対配置のdiv。React Flow等は使わない）。
// ズームはステージのtransform: scale。ポインタ座標→論理座標の変換（toLogical）は
// ノードのドラッグ・ポート接続・ヒットテストで共用する（重複実装しない）。
export function ScreenFlowCanvas({
  nodes,
  edges,
  functions,
  degrees,
  selection,
  onSelect,
  onMove,
  onConnect,
}: {
  nodes: ScreenNode[];
  edges: ScreenEdge[];
  functions: FunctionItem[];
  degrees: Map<string, { in: number; out: number }>;
  selection: FlowSelection;
  onSelect: (selection: FlowSelection) => void;
  onMove: (nodeId: string, x: number, y: number) => void;
  onConnect: (fromNodeId: string, toNodeId: string) => void;
}) {
  const [scale, setScale] = useState(1);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [conn, setConn] = useState<{ from: string; x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => positions.set(n.id, dragPos?.id === n.id ? { x: dragPos.x, y: dragPos.y } : nodePosition(n, i)));
  const functionById = new Map(functions.map((f) => [f.id, f]));
  // ステージの論理サイズは内容（全ノードの外接矩形＋余白）に合わせて描画ごとに算出する
  const stage = stageSizeFor([...positions.values()]);

  // ポインタ座標→ステージ内の論理座標。getBoundingClientRect()はスクロールとtransformを
  // 既に反映しているため、スクロール量の加減算は不要。
  function toLogical(clientX: number, clientY: number, currentScale: number) {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / currentScale, y: (clientY - rect.top) / currentScale };
  }

  function handlePointerDown(e: React.PointerEvent, node: ScreenNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const pos = positions.get(node.id)!;
    const s = scale;
    const start = toLogical(e.clientX, e.clientY, s);
    const d: DragState = { id: node.id, startX: start.x, startY: start.y, origX: pos.x, origY: pos.y, moved: false, stage };
    dragRef.current = d;

    function finalPos(ev: PointerEvent) {
      const cur = toLogical(ev.clientX, ev.clientY, s);
      return clampPosition(d.origX + (cur.x - d.startX), d.origY + (cur.y - d.startY), d.stage);
    }
    function handleMove(ev: PointerEvent) {
      const cur = toLogical(ev.clientX, ev.clientY, s);
      // 3px（画面上）未満の移動はクリック（選択）とみなす
      if (!d.moved && Math.hypot((cur.x - d.startX) * s, (cur.y - d.startY) * s) < 3) return;
      d.moved = true;
      const c = finalPos(ev);
      setDragPos({ id: d.id, x: c.x, y: c.y });
    }
    function handleUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      dragRef.current = null;
      if (d.moved) {
        const c = finalPos(ev);
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

  // ポートからの接続ドラッグ（ノード自体のドラッグ・選択は開始しない）
  function handlePortDown(e: React.PointerEvent, node: ScreenNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = scale;
    const p0 = toLogical(e.clientX, e.clientY, s);
    setConn({ from: node.id, x: p0.x, y: p0.y });

    function handleMove(ev: PointerEvent) {
      const p = toLogical(ev.clientX, ev.clientY, s);
      setConn({ from: node.id, x: p.x, y: p.y });
    }
    function handleUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setConn(null);
      const p = toLogical(ev.clientX, ev.clientY, s);
      // 論理座標での矩形ヒットテスト（DOMの要素判定に頼らない）
      const hit = nodes.find((n) => {
        const pos = positions.get(n.id)!;
        return p.x >= pos.x && p.x <= pos.x + NODE_W && p.y >= pos.y && p.y <= pos.y + NODE_H;
      });
      if (hit && hit.id !== node.id) onConnect(node.id, hit.id);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function changeScale(next: number) {
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(next * 10) / 10)));
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

  const connFrom = conn ? positions.get(conn.from) : null;

  return (
    // ツールバーはスクロールコンテナの外側に重ねる（スクロールしても右下に固定される）
    <div className="relative">
      <div
        className="overflow-auto rounded-lg border border-border"
        data-screen-flow-scroll
        style={{
          maxHeight: 720,
          backgroundColor: "var(--bg-sidebar)",
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div style={{ width: Math.round(stage.w * scale), height: Math.round(stage.h * scale) }}>
          <div
            ref={stageRef}
            className="relative"
            style={{ width: stage.w, height: stage.h, transform: `scale(${scale})`, transformOrigin: "top left" }}
            onPointerDown={() => onSelect(null)}
            data-screen-flow-stage
          >
            <svg width={stage.w} height={stage.h} className="absolute inset-0" style={{ overflow: "visible" }}>
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
              {conn && connFrom && (
                <line
                  data-screen-flow-connect-line
                  x1={connFrom.x + NODE_W}
                  y1={connFrom.y + NODE_H / 2}
                  x2={conn.x}
                  y2={conn.y}
                  stroke="var(--brand)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  style={{ pointerEvents: "none" }}
                />
              )}
            </svg>

            {nodes.map((node) => {
              const pos = positions.get(node.id)!;
              const selected = node.id === selectedNodeId;
              const isolated = isIsolated(node.id, degrees);
              const locked = isItemLocked(node.status);
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
                  {/* 確定済みのノードは遷移元にできないため、ポートを表示しない */}
                  {!locked && (
                    <span
                      data-screen-port={node.id}
                      title="ドラッグして遷移を作成"
                      onPointerDown={(e) => handlePortDown(e, node)}
                      className="absolute rounded-full hover:bg-brand"
                      style={{
                        right: -8,
                        top: 27,
                        width: 16,
                        height: 16,
                        background: "var(--bg-page)",
                        border: "2px solid var(--brand)",
                        cursor: "crosshair",
                        touchAction: "none",
                      }}
                    />
                  )}
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
      </div>

      <div
        data-screen-flow-zoom
        className="absolute right-3.5 bottom-3.5 flex gap-1.5 p-1.25 rounded-lg border border-border bg-page"
        style={{ boxShadow: "0 2px 8px rgba(27,26,23,.1)", zIndex: 5 }}
      >
        <button type="button" aria-label="縮小" onClick={() => changeScale(scale - 0.1)} className="font-mono text-xs px-2.25 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover">
          −
        </button>
        <span data-screen-flow-zoom-label className="font-mono text-[11px] text-secondary px-1 py-1.75 min-w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button type="button" aria-label="拡大" onClick={() => changeScale(scale + 0.1)} className="font-mono text-xs px-2.25 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover">
          ＋
        </button>
        <button type="button" onClick={() => setScale(1)} className="text-[11px] px-2.25 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover">
          100%
        </button>
      </div>
    </div>
  );
}
