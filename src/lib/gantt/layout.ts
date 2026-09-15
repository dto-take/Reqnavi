// progress_ux_phase1.md：大工程/中工程の2階層・日スケールのみのガント計算。
// 進捗率・完了・締切の概念は持たない。週/月スケール切替・折りたたみ・依存関係はフェーズ2以降。

export type ProgressTask = {
  id: string;
  parent_id: string | null;
  task_name: string;
  owner_primary: string | null;
  owner_secondary: string | null;
  week_start: string | null; // ISO date。中工程は必須、大工程は自動集計のためnull
  week_end: string | null;
  order_index: number;
};

export const DAY_WIDTH = 32;
export const ROW_HEIGHT = 36;
export const HEADER_HEIGHT = 38;

export function isPhase(node: ProgressTask): boolean {
  return node.parent_id === null;
}

export function childrenOf(nodes: ProgressTask[], phaseId: string): ProgressTask[] {
  return nodes.filter((n) => n.parent_id === phaseId);
}

// 大工程の期間は配下の中工程の最小開始日〜最大終了日から自動集計する（直接編集不可）。
// 子が0件の場合はnullを返す（バーを描画しない）。
export function rollupRange(nodes: ProgressTask[], phaseId: string): { start: string; end: string } | null {
  const kids = childrenOf(nodes, phaseId).filter((k) => k.week_start && k.week_end);
  if (kids.length === 0) return null;
  const start = kids.reduce((min, k) => (k.week_start! < min ? k.week_start! : min), kids[0].week_start!);
  const end = kids.reduce((max, k) => (k.week_end! > max ? k.week_end! : max), kids[0].week_end!);
  return { start, end };
}

// このノードの実際の表示期間（中工程は自身の日付、大工程は集計値）。
export function effectiveRange(nodes: ProgressTask[], node: ProgressTask): { start: string; end: string } | null {
  if (isPhase(node)) return rollupRange(nodes, node.id);
  if (!node.week_start || !node.week_end) return null;
  return { start: node.week_start, end: node.week_end };
}

// 折りたたみは本フェーズでは実装しないため、常に大工程→配下の中工程の順で全件展開する。
export function visibleRows(nodes: ProgressTask[]): ProgressTask[] {
  const phases = nodes.filter(isPhase).slice().sort((a, b) => a.order_index - b.order_index);
  const result: ProgressTask[] = [];
  for (const phase of phases) {
    result.push(phase);
    const kids = childrenOf(nodes, phase.id).slice().sort((a, b) => a.order_index - b.order_index);
    result.push(...kids);
  }
  return result;
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

export type GanttWindow = {
  windowStart: Date;
  days: Date[];
  width: number;
};

// 表示中の全行の実効期間から、日スケールのタイムライン全体の窓（開始日・日数）を求める。
// 該当データが無い場合は今日を中心に前後1週間の窓を仮に返す（空状態でも見出しは描画できるように）。
export function computeGanttWindow(nodes: ProgressTask[], rows: ProgressTask[]): GanttWindow {
  const ranges = rows
    .map((r) => effectiveRange(nodes, r))
    .filter((r): r is { start: string; end: string } => r !== null);

  let windowStart: Date;
  let windowEnd: Date;
  if (ranges.length === 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 7);
    windowEnd = new Date(today);
    windowEnd.setDate(today.getDate() + 7);
  } else {
    windowStart = ranges.reduce((min, r) => (toDate(r.start) < min ? toDate(r.start) : min), toDate(ranges[0].start));
    windowEnd = ranges.reduce((max, r) => (toDate(r.end) > max ? toDate(r.end) : max), toDate(ranges[0].end));
    // 今日が範囲外でも今日線が見えるよう、窓に今日を含める
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < windowStart) windowStart = today;
    if (today > windowEnd) windowEnd = today;
  }

  const dayCount = Math.max(dayDiff(windowStart, windowEnd) + 1, 1);
  const days: Date[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(windowStart);
    d.setDate(windowStart.getDate() + i);
    days.push(d);
  }

  return { windowStart, days, width: days.length * DAY_WIDTH };
}

export function barFor(
  nodes: ProgressTask[],
  node: ProgressTask,
  win: GanttWindow
): { left: number; width: number } | null {
  const range = effectiveRange(nodes, node);
  if (!range) return null;
  const startIdx = dayDiff(win.windowStart, toDate(range.start));
  const endIdx = dayDiff(win.windowStart, toDate(range.end));
  return {
    left: startIdx * DAY_WIDTH,
    width: (endIdx - startIdx + 1) * DAY_WIDTH,
  };
}

export function todayOffset(win: GanttWindow): number | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const idx = dayDiff(win.windowStart, today);
  if (idx < 0 || idx >= win.days.length) return null;
  return idx * DAY_WIDTH;
}
