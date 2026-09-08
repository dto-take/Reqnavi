"use client";

import { useMemo, useState } from "react";
import {
  computeWorkflowLayout,
  laneX,
  rowY,
  stubId,
  LANE_WIDTH,
  CARD_HEIGHT,
} from "@/lib/workflow-layout";
import { toWorkflowNode, NODE_META } from "@/lib/workflow-builder-shared";
import type { WorkflowNodeRow } from "@/actions/workflow-builder";

// レーン（アクター）はReqNaviでは固定マスタではなくrole_laneの自由入力値なので、
// ハンドオフの固定アクターカラー表の代わりに、インディゴ(#4f46e5)を避けた
// 分類用パレットをレーン順に割り当てる（規約「アクセントカラー以外にインディゴを使わない」）。
const LANE_COLORS = ["#0891b2", "#7c3aed", "#0d9488", "#d97706", "#64748b", "#0284c7", "#059669", "#be185d"];

function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length];
}

// 通常のコネクタ（3次ベジェ）。dy = max(30, 縦距離×0.45)
function bezierPath(fx: number, fy: number, tx: number, ty: number): string {
  const dy = Math.max(30, Math.abs(ty - fy) * 0.45);
  return `M${fx} ${fy} C ${fx} ${fy + dy}, ${tx} ${ty - dy}, ${tx} ${ty}`;
}

// 長距離のコネクタ（Noルート等）。レーン境界のガター（カードが存在しない帯）を直角に通す
function gutterPath(fx: number, fy: number, tx: number, ty: number, fromLane: number, toLane: number): string {
  const gutter = (Math.max(fromLane, toLane) + 1) * LANE_WIDTH - 12;
  const y1 = fy + 26;
  const y2 = ty - 26;
  return `M${fx} ${fy} L${fx} ${y1} L${gutter} ${y1} L${gutter} ${y2} L${tx} ${y2} L${tx} ${ty}`;
}

function connectorColor(label: string | null | undefined): string {
  if (label === "Yes") return "#10b981";
  if (label === "No") return "#f43f5e";
  return "#cbd5e1";
}

export function SwimlaneCanvas({
  nodes,
  selectedId,
  onSelect,
  insertTarget,
  onSelectStub,
  onInsert,
}: {
  nodes: WorkflowNodeRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  insertTarget: { conditionId: string; branch: "yes" | "no" } | null;
  onSelectStub: (conditionId: string, branch: "yes" | "no") => void;
  onInsert: (targetId: string, nodeType: string) => void;
}) {
  const layout = useMemo(() => computeWorkflowLayout(nodes.map(toWorkflowNode)), [nodes]);
  const cardW = LANE_WIDTH - 40;

  // ノードパレットからのドラッグ&ドロップの受け入れ（RequirementTableの並び替え機能と
  // 同じHTML5 Drag and Drop APIパターン）。targetIdは実ノードID・スタブID
  // （"stub:<conditionId>:<yes|no>"形式）のいずれも取り得る（フェーズDのinsertWorkflowNodeAfter
  // がそのまま受け付ける）。
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverTarget(targetId);
  }

  function handleDragLeave() {
    setDragOverTarget(null);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData("text/plain");
    setDragOverTarget(null);
    if (!nodeType) return;
    onInsert(targetId, nodeType);
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-secondary border border-border rounded-lg bg-page">
        まだ工程がありません
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto border border-border rounded-lg bg-page">
      <div style={{ width: layout.canvasWidth, minWidth: "100%" }}>
        <div className="sticky top-0 z-10 flex bg-white border-b border-[#cbd5e1] shadow-[0_1px_3px_rgba(15,23,42,.06)]">
          {layout.laneOrder.map((lane, i) => (
            <div key={lane} style={{ width: LANE_WIDTH }} className="flex-none flex items-center gap-2 px-3.5 py-2.5 border-r border-border">
              <span className="w-1.5 h-6.5 rounded-sm flex-none" style={{ background: laneColor(i) }} />
              <span className="text-[12.5px] font-bold text-primary truncate">{lane}</span>
            </div>
          ))}
        </div>

        <div className="relative" style={{ height: layout.canvasHeight }} onClick={() => onSelect(null)}>
          {layout.laneOrder.map((lane, i) => (
            <div
              key={lane}
              className="absolute top-0 bottom-0 border-r border-border pointer-events-none"
              style={{ left: i * LANE_WIDTH, width: LANE_WIDTH, background: i % 2 ? "var(--bg-sidebar)" : "transparent" }}
            />
          ))}

          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
            {layout.connectors.map((c, i) => {
              const from = layout.positions.get(c.from);
              const to = layout.positions.get(c.to);
              if (!from || !to) return null;
              const fx = laneX(from.lane), fy = rowY(from.row) + CARD_HEIGHT;
              const tx = laneX(to.lane), ty = rowY(to.row);
              const color = connectorColor(c.label);
              const d = c.kind === "long" ? gutterPath(fx, fy, tx, ty, from.lane, to.lane) : bezierPath(fx, fy, tx, ty);
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={c.kind === "stub" ? "5 4" : undefined}
                />
              );
            })}
            {layout.connectors.map((c, i) => {
              const to = layout.positions.get(c.to);
              if (!to) return null;
              const tx = laneX(to.lane), ty = rowY(to.row);
              return <circle key={i} cx={tx} cy={ty} r={3.5} fill={connectorColor(c.label)} />;
            })}
          </svg>

          {layout.connectors
            .filter((c) => c.label)
            .map((c, i) => {
              const from = layout.positions.get(c.from);
              if (!from) return null;
              const isYes = c.label === "Yes";
              const x = laneX(from.lane) + (isYes ? -48 : 48);
              const y = rowY(from.row) + CARD_HEIGHT + 20;
              return (
                <div
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide shadow-[0_1px_2px_rgba(15,23,42,.06)]"
                  style={{
                    left: x,
                    top: y,
                    background: isYes ? "#ecfdf5" : "#fff1f2",
                    color: isYes ? "#047857" : "#be123c",
                    border: `1px solid ${isYes ? "#a7f3d0" : "#fecdd3"}`,
                  }}
                >
                  {c.label}
                </div>
              );
            })}

          {nodes.map((n) => {
            const pos = layout.positions.get(n.id);
            if (!pos) return null;
            const meta = NODE_META[n.node_type] ?? NODE_META.task;
            const left = laneX(pos.lane) - cardW / 2;
            const top = rowY(pos.row);
            const sel = n.id === selectedId;
            const isDragOver = dragOverTarget === n.id;
            const step = layout.stepNumbers.get(n.id) ?? 0;
            const mode = n.mode ?? "手動";
            const modeBg = mode === "自動" ? "#f1f5f9" : "#eef2ff";
            const modeColor = mode === "自動" ? "#475569" : "#4338ca";

            return (
              <div
                key={n.id}
                data-node-card={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(n.id);
                }}
                onDragOver={(e) => handleDragOver(e, n.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, n.id)}
                className="absolute box-border flex flex-col gap-1.5 p-3 rounded-[11px] cursor-pointer"
                style={{
                  left,
                  top,
                  width: cardW,
                  border: isDragOver ? "2px dashed var(--brand)" : `1.5px solid ${sel ? "var(--brand)" : "#e2e8f0"}`,
                  background: isDragOver ? "color-mix(in srgb, var(--brand) 6%, white)" : "#ffffff",
                  boxShadow: sel
                    ? "0 0 0 3px color-mix(in srgb, var(--brand) 15%, transparent), 0 8px 18px -8px rgba(15,23,42,.3)"
                    : "0 1px 2px rgba(15,23,42,.06)",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-5.5 h-5.5 flex-none rounded-md flex items-center justify-center" style={{ background: meta.tint }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={meta.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d={meta.icon} />
                    </svg>
                  </span>
                  <span className="text-[10px] font-bold tracking-wide flex-1 min-w-0 truncate" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{String(step).padStart(2, "0")}</span>
                  <span className="px-1.5 py-px rounded text-[9.5px] font-bold" style={{ background: modeBg, color: modeColor }}>
                    {mode}
                  </span>
                </div>
                <div className="text-[13.5px] font-medium leading-snug text-primary line-clamp-2">{n.label}</div>
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-dashed border-border">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-none">
                    <path d="M3 5h18v11H3zM8 20h8" />
                  </svg>
                  <span className="text-[11px] text-secondary flex-1 min-w-0 truncate">{n.system_used || "（システム未定義）"}</span>
                  <span className="font-mono text-[10px] text-faint bg-hover px-1 rounded">{n.screen_id || "—"}</span>
                </div>
              </div>
            );
          })}

          {layout.stubs.map((s, i) => {
            const sId = stubId(s.afterNodeId, s.branch);
            const pos = layout.positions.get(sId);
            if (!pos) return null;
            const left = laneX(pos.lane) - cardW / 2;
            const top = rowY(pos.row);
            const isYes = s.branch === "yes";
            const stubTargetId = `${s.afterNodeId}:${s.branch}`;
            const isDragOver = dragOverTarget === stubTargetId;
            // 挿入先として選択中の見た目（デザインハンドオフ「空ブランチのスタブ」節の配色をそのまま移植）
            const active = insertTarget?.conditionId === s.afterNodeId && insertTarget?.branch === s.branch;
            const activeBg = isYes ? "#ecfdf5" : "#fff1f2";
            const activeBorder = isYes ? "#10b981" : "#f43f5e";
            const activeColor = isYes ? "#047857" : "#be123c";
            return (
              <div
                key={i}
                data-node-stub={stubTargetId}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStub(s.afterNodeId, s.branch);
                }}
                onDragOver={(e) => handleDragOver(e, stubTargetId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, sId)}
                className={`absolute box-border flex items-center justify-center gap-1.5 p-4 rounded-[11px] border-[1.5px] border-dashed text-[12.5px] font-medium cursor-pointer ${
                  active || isDragOver ? "" : "text-secondary"
                }`}
                style={{
                  left,
                  top,
                  width: cardW,
                  background: isDragOver ? "color-mix(in srgb, var(--brand) 8%, white)" : active ? activeBg : "#ffffff",
                  borderColor: isDragOver ? "var(--brand)" : active ? activeBorder : "#cbd5e1",
                  color: isDragOver ? "var(--brand)" : active ? activeColor : undefined,
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {isYes ? "Yes ルートに工程を追加" : "No ルートに工程を追加"}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
