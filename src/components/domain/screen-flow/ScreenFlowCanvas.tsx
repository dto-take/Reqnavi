"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ScreenEdge, ScreenNode } from "@/actions/screen-transition";
import type { ScreenSuggestions } from "@/actions/screen-flow-suggestions";
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

// snode/sedge：AI提案のノード/遷移（screen_flow_suggestionsの行id）
export type FlowSelection = { type: "node" | "edge" | "snode" | "sedge"; id: string } | null;

const DOT_COLOR: Record<ScreenNode["status"], string> = {
  confirmed: "var(--status-confirmed-text)",
  se_reviewing: "var(--status-review-text)",
  ai_draft: "var(--text-faint)",
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;
const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

// キー操作を横取りしない対象（入力欄・セレクト・ボタン・contenteditable）
function isFormTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName) || t.isContentEditable;
}

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
  suggestions,
  degrees,
  selection,
  onSelect,
  onMove,
  onConnect,
  onDelete,
  onNudge,
  onFlush,
}: {
  nodes: ScreenNode[];
  edges: ScreenEdge[];
  functions: FunctionItem[];
  suggestions: ScreenSuggestions;
  degrees: Map<string, { in: number; out: number }>;
  selection: FlowSelection;
  onSelect: (selection: FlowSelection) => void;
  onMove: (nodeId: string, x: number, y: number) => void;
  onConnect: (fromNodeId: string, toNodeId: string) => void;
  // キー操作（screen_flow_ux_phase4.md）。削除は右パネルのボタンと同じ処理を親が呼ぶ。
  onDelete: () => void;
  onNudge: (nodeId: string, dx: number, dy: number) => void;
  onFlush: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const scaleRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  // ズーム後にスクロール位置を補正するための基準（論理座標とコンテナ内の表示位置）
  const anchorRef = useRef<{ lx: number; ly: number; cx: number; cy: number } | null>(null);
  const panRef = useRef(false);
  const connCancelRef = useRef<(() => void) | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [conn, setConn] = useState<{ from: string; x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => positions.set(n.id, dragPos?.id === n.id ? { x: dragPos.x, y: dragPos.y } : nodePosition(n, i)));
  // 提案ノードも座標表に入れる（遷移の端点・ステージサイズ用）。ドラッグ対象にはしない。
  for (const s of suggestions.nodes) positions.set(s.id, { x: s.x, y: s.y });
  const functionById = new Map(functions.map((f) => [f.id, f]));
  // ステージの論理サイズは内容（全ノードの外接矩形＋余白）に合わせて描画ごとに算出する
  const stage = stageSizeFor([...positions.values()]);

  // ポインタ座標→ステージ内の論理座標。getBoundingClientRect()はスクロールとtransformを
  // 既に反映しているため、スクロール量の加減算は不要。
  function toLogical(clientX: number, clientY: number, currentScale: number) {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / currentScale, y: (clientY - rect.top) / currentScale };
  }

  function focusCanvas() {
    scrollRef.current?.focus({ preventScroll: true });
  }

  // 倍率を変え、anchor（コンテナ内の表示位置cx,cy）の下にある論理座標が動かないよう
  // useLayoutEffectでスクロール位置を補正する（規約61：座標はgetBoundingClientRectから算出）
  function zoomTo(next: number, cx: number, cy: number) {
    const el = scrollRef.current;
    const stageEl = stageRef.current;
    if (!el || !stageEl) return;
    const target = clampScale(next);
    if (target === scaleRef.current) return;
    const rect = stageEl.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    anchorRef.current = {
      lx: (box.left + cx - rect.left) / scaleRef.current,
      ly: (box.top + cy - rect.top) / scaleRef.current,
      cx,
      cy,
    };
    scaleRef.current = target;
    setScale(target);
  }

  useLayoutEffect(() => {
    const a = anchorRef.current;
    const el = scrollRef.current;
    if (!a || !el) return;
    anchorRef.current = null;
    el.scrollLeft = a.lx * scale - a.cx;
    el.scrollTop = a.ly * scale - a.cy;
  }, [scale]);

  // wheelはReactのonWheel（受動リスナー）ではpreventDefaultが効かずブラウザ全体のズームが
  // 走るため、passive:falseでネイティブに登録する。Ctrl/⌘が付いたときだけズームする。
  const zoomToRef = useRef(zoomTo);
  useLayoutEffect(() => {
    zoomToRef.current = zoomTo;
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleWheel(ev: WheelEvent) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const box = el!.getBoundingClientRect();
      zoomToRef.current(scaleRef.current * Math.exp(-ev.deltaY * 0.0015), ev.clientX - box.left, ev.clientY - box.top);
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // パンモードはSpaceを離す・コンテナのblur・ウィンドウのblurで必ず解除する
  function endPanMode() {
    panRef.current = false;
    setPanMode(false);
  }
  useEffect(() => {
    function onBlur() {
      panRef.current = false;
      setPanMode(false);
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (isFormTarget(e.target)) return;
    if (e.key === " ") {
      e.preventDefault();
      if (!e.repeat) {
        panRef.current = true;
        setPanMode(true);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      if (connCancelRef.current) connCancelRef.current();
      else onSelect(null);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (!selection) return;
      e.preventDefault();
      onDelete();
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = arrows[e.key];
    if (d && selection?.type === "node") {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      onNudge(selection.id, d[0] * step, d[1] * step);
    }
  }

  // パンモード中のポインタはキャプチャ段階で奪い、ノードのドラッグ・選択・背景クリック・
  // ポート接続のいずれも開始させない。
  function handlePanStart(e: React.PointerEvent) {
    if (!panRef.current || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = scrollRef.current!;
    const sx = e.clientX;
    const sy = e.clientY;
    const sl = el.scrollLeft;
    const st = el.scrollTop;
    setPanning(true);
    function move(ev: PointerEvent) {
      el.scrollLeft = sl - (ev.clientX - sx);
      el.scrollTop = st - (ev.clientY - sy);
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPanning(false);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const cur = (def: string) => (panMode ? (panning ? "grabbing" : "grab") : conn ? "crosshair" : def);

  function handlePointerDown(e: React.PointerEvent, node: ScreenNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    focusCanvas();
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
    focusCanvas();
    const s = scale;
    const p0 = toLogical(e.clientX, e.clientY, s);
    setConn({ from: node.id, x: p0.x, y: p0.y });

    function handleMove(ev: PointerEvent) {
      const p = toLogical(ev.clientX, ev.clientY, s);
      setConn({ from: node.id, x: p.x, y: p.y });
    }
    // Escでキャンセル：リスナーを外して破線を消す（遷移は作らない）
    connCancelRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      connCancelRef.current = null;
      setConn(null);
    };
    function handleUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      connCancelRef.current = null;
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

  // ツールバー操作は表示領域の中央を基準に拡縮する（0.1刻み）
  function changeScale(next: number) {
    const el = scrollRef.current;
    zoomTo(Math.round(next * 10) / 10, el ? el.clientWidth / 2 : 0, el ? el.clientHeight / 2 : 0);
  }

  const selectedNodeId = selection?.type === "node" ? selection.id : null;
  const selectedEdgeId = selection?.type === "edge" ? selection.id : null;
  const selectedSNodeId = selection?.type === "snode" ? selection.id : null;
  const selectedSEdgeId = selection?.type === "sedge" ? selection.id : null;

  const geoms = edges.flatMap((e) => {
    const a = positions.get(e.from_node);
    const b = positions.get(e.to_node);
    if (!a || !b) return [];
    const isSel = e.id === selectedEdgeId;
    const hot = isSel || (selectedNodeId !== null && (e.from_node === selectedNodeId || e.to_node === selectedNodeId));
    return [{ edge: e, geom: edgeGeometry(a, b, hasReverseEdge(e, edges)), isSel, hot }];
  });

  // 提案遷移：実遷移と同じgeom()で、提案ノードも端点として扱う
  const allPairs = [
    ...edges.map((e) => ({ from_node: e.from_node, to_node: e.to_node })),
    ...suggestions.transitions.map((t) => ({ from_node: t.from.id, to_node: t.to.id })),
  ];
  const sgeoms = suggestions.transitions.flatMap((t) => {
    const a = positions.get(t.from.id);
    const b = positions.get(t.to.id);
    if (!a || !b) return [];
    const paired = allPairs.some((p) => p.from_node === t.to.id && p.to_node === t.from.id);
    return [{ s: t, geom: edgeGeometry(a, b, paired), isSel: t.id === selectedSEdgeId }];
  });

  const connFrom = conn ? positions.get(conn.from) : null;

  return (
    // ツールバーはスクロールコンテナの外側に重ねる（スクロールしても右下に固定される）
    <div className="relative">
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          if (e.key === " ") endPanMode();
        }}
        onBlur={() => {
          endPanMode();
          onFlush();
        }}
        onPointerDownCapture={handlePanStart}
        className={`overflow-auto rounded-lg border border-border${panMode || panning || conn ? " select-none" : ""}`}
        data-screen-flow-scroll
        data-pan-mode={panMode ? "1" : undefined}
        style={{
          cursor: panMode ? (panning ? "grabbing" : "grab") : conn ? "crosshair" : undefined,
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
            onPointerDown={() => {
              focusCanvas();
              onSelect(null);
            }}
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
                    focusCanvas();
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
              {sgeoms.map(({ s, geom }) => (
                <path
                  key={`shit-${s.id}`}
                  d={geom.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    focusCanvas();
                    onSelect({ type: "sedge", id: s.id });
                  }}
                />
              ))}
              {sgeoms.map(({ s, geom, isSel }) => {
                const color = isSel ? "var(--text-primary)" : "var(--brand)";
                return (
                  <g key={`s-${s.id}`} data-screen-suggestion-edge={s.id} style={{ pointerEvents: "none" }} opacity={isSel ? 1 : 0.6}>
                    <path d={geom.d} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="5 4" />
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
                    cursor: cur(dragPos?.id === node.id ? "grabbing" : "grab"),
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
                        cursor: cur("crosshair"),
                        touchAction: "none",
                      }}
                    />
                  )}
                </div>
              );
            })}

            {suggestions.nodes.map((sn) => {
              const selected = sn.id === selectedSNodeId;
              const fn = sn.function_item_id ? functionById.get(sn.function_item_id) : undefined;
              return (
                <div
                  key={sn.id}
                  data-screen-suggestion-node={sn.id}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    focusCanvas();
                    onSelect({ type: "snode", id: sn.id });
                  }}
                  className="absolute flex flex-col gap-1 rounded-xl select-none"
                  style={{
                    left: sn.x,
                    top: sn.y,
                    width: NODE_W,
                    height: NODE_H,
                    boxSizing: "border-box",
                    padding: selected ? "9px 11px" : "10px 12px",
                    background: "var(--bg-sidebar)",
                    border: selected ? "2px dashed var(--text-primary)" : "1.5px dashed var(--brand)",
                    cursor: cur("pointer"),
                    zIndex: 2,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[9.5px] font-medium px-1.5 rounded-full"
                      style={{ color: "var(--brand)", border: "1px solid var(--brand)" }}
                    >
                      AI提案
                    </span>
                  </div>
                  <div className="text-[12.5px] font-bold leading-snug text-primary truncate">{sn.name}</div>
                  <div className="text-[10.5px] truncate" style={{ color: sn.function_item_id ? "var(--brand)" : "var(--text-faint)" }}>
                    {sn.function_item_id ? `9章 ${fn ? `${fn.code}：${fn.name}` : "紐付け済み"}` : "9章 紐付けなし"}
                  </div>
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
                    focusCanvas();
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

            {sgeoms.map(({ s, geom, isSel }) => (
              <div
                key={`slabel-${s.id}`}
                data-screen-suggestion-label={s.id}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  focusCanvas();
                  onSelect({ type: "sedge", id: s.id });
                }}
                className="absolute text-[10.5px] font-medium whitespace-nowrap rounded-full cursor-pointer"
                style={{
                  left: geom.lx,
                  top: geom.ly,
                  transform: "translate(-50%, -50%)",
                  padding: "4px 8px",
                  zIndex: 3,
                  color: "var(--brand)",
                  background: "var(--bg-page)",
                  border: `1px dashed ${isSel ? "var(--text-primary)" : "var(--brand)"}`,
                  opacity: isSel ? 1 : 0.8,
                }}
              >
                {s.label || "（操作名なし）"}
              </div>
            ))}

            {nodes.length === 0 && suggestions.nodes.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-faint">
                画面がありません。右パネルの「図に追加」か「AI素案（差分で提案）」から始めます。
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
        <button type="button" aria-label="100%に戻す" onClick={() => changeScale(1)} className="text-[11px] px-2.25 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover">
          100%
        </button>
      </div>
    </div>
  );
}
