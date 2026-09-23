"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  childrenOf,
  barFor,
  barForRange,
  todayOffsetPct,
  addDaysIso,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  type GanttWindow,
  type GanttScale,
  type ProgressTask,
} from "@/lib/gantt/layout";
import { ownerColor } from "@/lib/gantt/owner-color";

const WBS_WIDTH = 220;
const SCALE_LABELS: Record<GanttScale, string> = { day: "日", week: "週", month: "月" };
const TASK_BAR_TOP = 9;
const TASK_BAR_HEIGHT = 18;
const EDGE_HANDLE_WIDTH = 7;

// progress_ux_phase3.md Step5：ドラッグ操作。「やってはいけないこと」の簡略化の余地に従い、
// 全スケールで同精度のドラッグを無理に実現しようとせず、ドラッグでの期間変更は日スケール
// （1日=固定ピクセル幅）でのみ許可する。週/月スケールでは詳細パネルからの日付編集のみ行う
// （既存のupdateProgressTaskFieldがそのまま使える）。
type DragMode = "move" | "resize-start" | "resize-end";
type DragState = {
  taskId: string;
  mode: DragMode;
  pxPerDay: number;
  startClientX: number;
  originalStart: string;
  originalEnd: string;
  previewStart: string;
  previewEnd: string;
};

export function WbsGanttPane({
  nodes,
  rows,
  win,
  selectedId,
  onSelect,
  onAddPhase,
  scale,
  onScaleChange,
  onJumpToday,
  collapsedPhaseIds,
  onToggleCollapse,
  ownerFocus,
  onToggleOwnerFocus,
  onShiftTask,
}: {
  nodes: ProgressTask[];
  rows: ProgressTask[];
  win: GanttWindow;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddPhase: () => void;
  scale: GanttScale;
  onScaleChange: (scale: GanttScale) => void;
  onJumpToday: () => void;
  collapsedPhaseIds: Set<string>;
  onToggleCollapse: (phaseId: string) => void;
  ownerFocus: string | null;
  onToggleOwnerFocus: (name: string) => void;
  onShiftTask: (taskId: string, newStart: string, newEnd: string) => void;
}) {
  const todayPct = todayOffsetPct(win);
  const todayMarkerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // フェーズ2 Step3：現在使われている主担当ごとのチップ（担当色・担当名・工程数）。
  // 折りたたみ状態に関わらず、章内の全中工程から集計する（開閉でチップが出たり消えたりしないように）。
  const ownerChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      if (n.parent_id === null) continue;
      const name = n.owner_primary?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [nodes]);

  // フェーズ3 Step4：先行工程を持つ中工程ごとのコネクタ座標（表示中の行にのみ描画。
  // 折りたたみで先行/後続のどちらかが非表示になっている場合は描画しない）。
  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const connectors = useMemo(() => {
    const result: { key: string; x1Pct: number; x2Pct: number; y1: number; y2: number; highlighted: boolean }[] = [];
    for (const row of rows) {
      if (!row.predecessor_id) continue;
      const predIndex = rowIndexById.get(row.predecessor_id);
      const succIndex = rowIndexById.get(row.id);
      if (predIndex === undefined || succIndex === undefined) continue;
      const predNode = nodes.find((n) => n.id === row.predecessor_id);
      if (!predNode) continue;
      const predBar = barFor(nodes, predNode, win);
      const succBar = barFor(nodes, row, win);
      if (!predBar || !succBar) continue;
      result.push({
        key: row.id,
        x1Pct: predBar.leftPct + predBar.widthPct,
        x2Pct: succBar.leftPct,
        y1: predIndex * ROW_HEIGHT + TASK_BAR_TOP + TASK_BAR_HEIGHT / 2,
        y2: succIndex * ROW_HEIGHT + TASK_BAR_TOP + TASK_BAR_HEIGHT / 2,
        highlighted: selectedId === row.id || selectedId === row.predecessor_id,
      });
    }
    return result;
  }, [rows, rowIndexById, nodes, win, selectedId]);

  function handleJumpToday() {
    onJumpToday();
    // スケール切替の再描画後にスクロールさせるため、次フレームで実行する
    requestAnimationFrame(() => {
      todayMarkerRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
    });
  }

  function beginDrag(e: React.PointerEvent, task: ProgressTask, mode: DragMode) {
    if (scale !== "day" || !task.week_start || !task.week_end) return;
    e.stopPropagation();
    e.preventDefault();
    const trackWidth = trackRef.current?.getBoundingClientRect().width ?? 0;
    const pxPerDay = trackWidth / win.totalDays;
    if (!(pxPerDay > 0)) return;
    setDrag({
      taskId: task.id,
      mode,
      pxPerDay,
      startClientX: e.clientX,
      originalStart: task.week_start,
      originalEnd: task.week_end,
      previewStart: task.week_start,
      previewEnd: task.week_end,
    });
  }

  useEffect(() => {
    if (!drag) return;

    function handleMove(e: PointerEvent) {
      if (!drag) return;
      const deltaDays = Math.round((e.clientX - drag.startClientX) / drag.pxPerDay);
      let previewStart = drag.originalStart;
      let previewEnd = drag.originalEnd;
      if (drag.mode === "move") {
        previewStart = addDaysIso(drag.originalStart, deltaDays);
        previewEnd = addDaysIso(drag.originalEnd, deltaDays);
      } else if (drag.mode === "resize-start") {
        previewStart = addDaysIso(drag.originalStart, deltaDays);
        if (previewStart > drag.originalEnd) previewStart = drag.originalEnd;
      } else {
        previewEnd = addDaysIso(drag.originalEnd, deltaDays);
        if (previewEnd < drag.originalStart) previewEnd = drag.originalStart;
      }
      if (previewStart !== drag.previewStart || previewEnd !== drag.previewEnd) {
        setDrag({ ...drag, previewStart, previewEnd });
      }
    }

    function handleUp() {
      if (!drag) return;
      if (drag.previewStart !== drag.originalStart || drag.previewEnd !== drag.originalEnd) {
        onShiftTask(drag.taskId, drag.previewStart, drag.previewEnd);
      }
      setDrag(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, onShiftTask]);

  const trackStyle = win.minTrackWidth === "100%" ? { width: "100%" } : { width: win.minTrackWidth, minWidth: win.minTrackWidth };

  return (
    <div className="flex flex-col border-r border-border" style={{ background: "var(--bg-page)" }}>
      {/* ヘッダー1行目：章ラベル・章名・スケール切替・今日へ・「＋ 大工程」 */}
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--bg-sidebar)" }}>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10.5px] tracking-wide text-faint">CHAPTER 15 / 15</span>
          <h1 className="text-lg font-semibold text-primary">進捗</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden bg-page">
            {(["day", "week", "month"] as GanttScale[]).map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => onScaleChange(s)}
                className="px-3 py-1.5 text-xs font-medium cursor-pointer"
                style={{
                  borderLeft: i > 0 ? "1px solid var(--border)" : undefined,
                  background: scale === s ? "var(--text-primary)" : "transparent",
                  color: scale === s ? "#fff" : "var(--text-secondary)",
                }}
              >
                {SCALE_LABELS[s]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleJumpToday}
            className="h-8 px-3 rounded-md text-xs font-medium border border-border bg-page cursor-pointer hover:bg-hover"
          >
            今日へ
          </button>
          <button
            type="button"
            onClick={onAddPhase}
            className="h-9 px-4 rounded-md text-sm font-medium text-white cursor-pointer hover:opacity-90"
            style={{ background: "var(--brand)" }}
          >
            ＋ 大工程
          </button>
        </div>
      </div>

      {/* ヘッダー2行目：担当フィルタ */}
      {ownerChips.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap" style={{ background: "var(--bg-sidebar)" }}>
          <span className="font-mono text-[10px] tracking-wide text-faint uppercase mr-1">主担当</span>
          {ownerChips.map(({ name, count }) => {
            const active = ownerFocus === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onToggleOwnerFocus(name)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium cursor-pointer border"
                style={{
                  background: active ? "var(--text-primary)" : "#fff",
                  color: active ? "#fff" : "var(--text-secondary)",
                  borderColor: active ? "var(--text-primary)" : "var(--border)",
                }}
              >
                <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: ownerColor(name) }} />
                {name}
                <span className="font-mono" style={{ color: active ? "#d5d1c9" : "var(--text-faint)" }}>
                  {count}
                </span>
              </button>
            );
          })}
          {scale === "day" && <span className="ml-auto text-[11px] text-faint">バーのドラッグで期間変更・端をつかんで伸縮</span>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-faint px-4 py-6">まだ大工程がありません。「＋ 大工程」から追加してください。</p>
      ) : (
        <div className="flex" style={{ maxHeight: 560, overflowY: "auto" }}>
          {/* WBS列：固定幅・横スクロールしない */}
          <div style={{ width: WBS_WIDTH, flexShrink: 0 }} className="border-r border-border">
            <div
              className="flex items-center px-2.5 font-mono text-[10.5px] tracking-wide text-faint border-b border-border"
              style={{ height: HEADER_HEIGHT, background: "var(--bg-sidebar)", position: "sticky", top: 0, zIndex: 1 }}
            >
              WBS
            </div>
            {rows.map((row) => {
              const isPhaseRow = row.parent_id === null;
              const selected = row.id === selectedId;
              const kidCount = isPhaseRow ? childrenOf(nodes, row.id).length : 0;
              const collapsed = isPhaseRow && collapsedPhaseIds.has(row.id);
              const dimmed = !isPhaseRow && ownerFocus !== null && row.owner_primary !== ownerFocus;
              return (
                <div
                  key={row.id}
                  data-progress-wbs-row={row.id}
                  onClick={() => onSelect(row.id)}
                  role="treeitem"
                  aria-selected={selected}
                  className="flex items-center gap-1.5 cursor-pointer border-b border-border text-[12.5px] hover:bg-hover"
                  style={{
                    height: ROW_HEIGHT,
                    paddingLeft: isPhaseRow ? 4 : 26,
                    paddingRight: 8,
                    background: selected ? "#fff" : isPhaseRow ? "var(--bg-hover)" : "transparent",
                    borderLeft: `3px solid ${selected ? "var(--text-primary)" : "transparent"}`,
                    opacity: dimmed ? 0.4 : 1,
                  }}
                >
                  {isPhaseRow ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (kidCount > 0) onToggleCollapse(row.id);
                      }}
                      className="w-2.5 flex-none text-faint font-mono text-[10px] cursor-pointer"
                      tabIndex={kidCount > 0 ? 0 : -1}
                    >
                      {kidCount > 0 ? (collapsed ? "▸" : "▾") : ""}
                    </button>
                  ) : (
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: ownerColor(row.owner_primary) }} />
                  )}
                  <span className={`flex-1 min-w-0 truncate ${isPhaseRow ? "font-bold" : selected ? "font-medium" : ""}`}>
                    {row.task_name || "（未入力）"}
                  </span>
                  <span className="font-mono text-[10px] text-faint flex-none">
                    {isPhaseRow ? `中工程 ${kidCount}` : row.owner_primary || ""}
                  </span>
                </div>
              );
            })}
          </div>

          {/* タイムライン：横スクロール可。日/週は固定最小幅、月は100%幅に列を按分する */}
          <div className="overflow-x-auto flex-1">
            <div style={trackStyle} className="relative" ref={trackRef}>
              <div
                className="flex border-b border-border"
                style={{ height: HEADER_HEIGHT, background: "var(--bg-sidebar)", position: "sticky", top: 0, zIndex: 1 }}
              >
                {win.columns.map((col, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center font-mono text-[10px] text-faint border-l border-border"
                    style={{ flex: `${col.days} 0 0%` }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              <div className="relative">
                {/* グリッド線 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {win.columns.map((_, i) => (
                    <div key={i} className="border-l border-border" style={{ flex: `${win.columns[i].days} 0 0%`, opacity: 0.5 }} />
                  ))}
                </div>
                {/* 今日線 */}
                {todayPct !== null && (
                  <div
                    ref={todayMarkerRef}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: `${todayPct}%`, width: 2, background: "var(--status-needhearing-text)" }}
                  />
                )}

                {rows.map((row) => {
                  const isPhaseRow = row.parent_id === null;
                  const isDraggingThis = drag?.taskId === row.id;
                  const bar = isDraggingThis ? barForRange(drag!.previewStart, drag!.previewEnd, win) : barFor(nodes, row, win);
                  const selected = row.id === selectedId;
                  const dimmed = !isPhaseRow && ownerFocus !== null && row.owner_primary !== ownerFocus;
                  const draggable = !isPhaseRow && scale === "day";
                  return (
                    <div
                      key={row.id}
                      onClick={() => onSelect(row.id)}
                      className="relative border-b border-border cursor-pointer hover:bg-hover"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {bar && (
                        <div
                          data-progress-bar={row.id}
                          className="absolute rounded"
                          style={{
                            left: `${bar.leftPct}%`,
                            width: `${Math.max(bar.widthPct, 0.5)}%`,
                            top: isPhaseRow ? 12 : TASK_BAR_TOP,
                            height: isPhaseRow ? 12 : TASK_BAR_HEIGHT,
                            background: isPhaseRow ? "var(--text-primary)" : ownerColor(row.owner_primary),
                            boxShadow: selected ? "0 0 0 2px rgba(43,42,39,.22)" : undefined,
                            opacity: dimmed ? 0.22 : 1,
                          }}
                        >
                          {draggable && (
                            <>
                              <div
                                onPointerDown={(e) => beginDrag(e, row, "move")}
                                className="absolute inset-0"
                                style={{ cursor: isDraggingThis ? "grabbing" : "grab" }}
                              />
                              <div
                                onPointerDown={(e) => beginDrag(e, row, "resize-start")}
                                className="absolute top-0 bottom-0 left-0"
                                style={{ width: EDGE_HANDLE_WIDTH, cursor: "ew-resize" }}
                              />
                              <div
                                onPointerDown={(e) => beginDrag(e, row, "resize-end")}
                                className="absolute top-0 bottom-0 right-0"
                                style={{ width: EDGE_HANDLE_WIDTH, cursor: "ew-resize" }}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* フェーズ3 Step4：先行工程のコネクタ線（縦線＋横線＋矢頭のL字。CSS境界線で描画し、
                    バーと同じ%座標系をそのまま使う） */}
                {connectors.map((c) => {
                  const color = c.highlighted ? "var(--status-needhearing-text)" : "var(--text-faint)";
                  const top = Math.min(c.y1, c.y2);
                  const height = Math.abs(c.y2 - c.y1);
                  const left = Math.min(c.x1Pct, c.x2Pct);
                  const width = Math.abs(c.x2Pct - c.x1Pct);
                  const goingRight = c.x2Pct >= c.x1Pct;
                  return (
                    <div key={c.key} className="pointer-events-none">
                      <div className="absolute" style={{ left: `${c.x1Pct}%`, top, height, borderLeft: `1.5px solid ${color}` }} />
                      <div className="absolute" style={{ left: `${left}%`, width: `${width}%`, top: c.y2, borderTop: `1.5px solid ${color}` }} />
                      <div
                        className="absolute"
                        style={{
                          left: `${c.x2Pct}%`,
                          top: c.y2 - 3.5,
                          marginLeft: goingRight ? 0 : -5,
                          width: 0,
                          height: 0,
                          borderTop: "3.5px solid transparent",
                          borderBottom: "3.5px solid transparent",
                          ...(goingRight ? { borderLeft: `5px solid ${color}` } : { borderRight: `5px solid ${color}` }),
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
