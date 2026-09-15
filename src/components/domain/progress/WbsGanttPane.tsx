"use client";

import { useMemo, useRef } from "react";
import {
  childrenOf,
  barFor,
  todayOffsetPct,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  type GanttWindow,
  type GanttScale,
  type ProgressTask,
} from "@/lib/gantt/layout";
import { ownerColor } from "@/lib/gantt/owner-color";

const WBS_WIDTH = 220;
const SCALE_LABELS: Record<GanttScale, string> = { day: "日", week: "週", month: "月" };

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
}) {
  const todayPct = todayOffsetPct(win);
  const todayMarkerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  function handleJumpToday() {
    onJumpToday();
    // スケール切替の再描画後にスクロールさせるため、次フレームで実行する
    requestAnimationFrame(() => {
      todayMarkerRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
    });
  }

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
          <div className="overflow-x-auto flex-1" ref={scrollRef}>
            <div style={trackStyle} className="relative">
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
                  const bar = barFor(nodes, row, win);
                  const selected = row.id === selectedId;
                  const dimmed = !isPhaseRow && ownerFocus !== null && row.owner_primary !== ownerFocus;
                  return (
                    <div
                      key={row.id}
                      onClick={() => onSelect(row.id)}
                      className="relative border-b border-border cursor-pointer hover:bg-hover"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {bar && (
                        <div
                          className="absolute rounded"
                          style={{
                            left: `${bar.leftPct}%`,
                            width: `${bar.widthPct}%`,
                            top: isPhaseRow ? 12 : 9,
                            height: isPhaseRow ? 12 : 18,
                            background: isPhaseRow ? "var(--text-primary)" : ownerColor(row.owner_primary),
                            boxShadow: selected ? "0 0 0 2px rgba(43,42,39,.22)" : undefined,
                            opacity: dimmed ? 0.22 : 1,
                          }}
                        />
                      )}
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
