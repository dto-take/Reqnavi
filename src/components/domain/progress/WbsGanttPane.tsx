"use client";

import { childrenOf, barFor, todayOffset, DAY_WIDTH, ROW_HEIGHT, HEADER_HEIGHT, type GanttWindow, type ProgressTask } from "@/lib/gantt/layout";
import { ownerColor } from "@/lib/gantt/owner-color";

const WBS_WIDTH = 220;

function formatDayLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function WbsGanttPane({
  nodes,
  rows,
  win,
  selectedId,
  onSelect,
  onAddPhase,
}: {
  nodes: ProgressTask[];
  rows: ProgressTask[];
  win: GanttWindow;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddPhase: () => void;
}) {
  const today = todayOffset(win);

  return (
    <div className="flex flex-col border-r border-border" style={{ background: "var(--bg-page)" }}>
      {/* ヘッダー：章ラベル・章名・「＋ 大工程」 */}
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between gap-3" style={{ background: "var(--bg-sidebar)" }}>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10.5px] tracking-wide text-faint">CHAPTER 15 / 15</span>
          <h1 className="text-lg font-semibold text-primary">進捗</h1>
        </div>
        <button
          type="button"
          onClick={onAddPhase}
          className="h-9 px-4 rounded-md text-sm font-medium text-white cursor-pointer hover:opacity-90"
          style={{ background: "var(--brand)" }}
        >
          ＋ 大工程
        </button>
      </div>

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
                    paddingLeft: isPhaseRow ? 10 : 26,
                    paddingRight: 8,
                    background: selected ? "#fff" : isPhaseRow ? "var(--bg-hover)" : "transparent",
                    borderLeft: `3px solid ${selected ? "var(--text-primary)" : "transparent"}`,
                  }}
                >
                  {!isPhaseRow && (
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

          {/* タイムライン：日スケールのみ。横スクロール可 */}
          <div className="overflow-x-auto flex-1">
            <div style={{ width: Math.max(win.width, 1) }} className="relative">
              <div
                className="flex border-b border-border"
                style={{ height: HEADER_HEIGHT, background: "var(--bg-sidebar)", position: "sticky", top: 0, zIndex: 1 }}
              >
                {win.days.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center font-mono text-[10px] text-faint border-l border-border flex-none"
                    style={{ width: DAY_WIDTH }}
                  >
                    {formatDayLabel(d)}
                  </div>
                ))}
              </div>

              <div className="relative">
                {/* グリッド線 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {win.days.map((_, i) => (
                    <div key={i} className="border-l border-border flex-none" style={{ width: DAY_WIDTH, opacity: 0.5 }} />
                  ))}
                </div>
                {/* 今日線 */}
                {today !== null && (
                  <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: today, width: 2, background: "var(--status-needhearing-text)" }}
                  />
                )}

                {rows.map((row) => {
                  const isPhaseRow = row.parent_id === null;
                  const bar = barFor(nodes, row, win);
                  const selected = row.id === selectedId;
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
                            left: bar.left,
                            width: Math.max(bar.width, 4),
                            top: isPhaseRow ? 12 : 9,
                            height: isPhaseRow ? 12 : 18,
                            background: isPhaseRow ? "var(--text-primary)" : ownerColor(row.owner_primary),
                            boxShadow: selected ? "0 0 0 2px rgba(43,42,39,.22)" : undefined,
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
