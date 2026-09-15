// progress_ux_phase1.md：大工程/中工程の2階層のガント計算。進捗率・完了・締切の概念は持たない。
// progress_ux_phase2.md：日/週/月のスケール切替・折りたたみに対応する。依存関係・ドラッグはフェーズ3以降。

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

// フェーズ2：折りたたまれた大工程の配下の中工程はWBS列・ガントの両方から除外する
// （行自体を削除するのではなく、表示リストへの追加をスキップするだけ。データは保持される）。
export function visibleRows(nodes: ProgressTask[], collapsedPhaseIds: Set<string> = new Set()): ProgressTask[] {
  const phases = nodes.filter(isPhase).slice().sort((a, b) => a.order_index - b.order_index);
  const result: ProgressTask[] = [];
  for (const phase of phases) {
    result.push(phase);
    if (collapsedPhaseIds.has(phase.id)) continue;
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

function addDaysDate(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function addMonthsDate(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function startOfWeek(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // 月曜始まり
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function todayDate(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export type GanttScale = "day" | "week" | "month";

export type GanttColumn = { start: Date; days: number; label: string };

export type GanttWindow = {
  scale: GanttScale;
  windowStart: Date;
  totalDays: number; // windowStartから窓末尾までの日数（バー位置計算の基準）
  columns: GanttColumn[];
  minTrackWidth: number | "100%";
};

// 表示中の全行の実効期間（+ 今日）から窓の起点を決め、スケールに応じた固定長の窓
// （日:21日／週:10週=70日／月:3か月）を構築する。ハンドオフの「列を圧縮してはならない、
// 足りなければ横スクロールさせる」という方針に合わせ、各スケールの最小トラック幅を返す
// （日:660px・週:600px・月:100%。実際の値はバーの位置計算には使わず、%ベースの座標を
// この最小幅の上に重ねることで、画面が広い場合はそのぶん広がっても位置がずれないようにする）。
export function computeGanttWindow(nodes: ProgressTask[], rows: ProgressTask[], scale: GanttScale): GanttWindow {
  const ranges = rows
    .map((r) => effectiveRange(nodes, r))
    .filter((r): r is { start: string; end: string } => r !== null);

  const today = todayDate();
  let anchor: Date;
  if (ranges.length === 0) {
    anchor = today;
  } else {
    const earliest = ranges.reduce((min, r) => (toDate(r.start) < min ? toDate(r.start) : min), toDate(ranges[0].start));
    anchor = earliest < today ? earliest : today;
  }

  if (scale === "day") {
    const windowStart = anchor;
    const totalDays = 21;
    const columns: GanttColumn[] = Array.from({ length: totalDays }, (_, i) => {
      const d = addDaysDate(windowStart, i);
      return { start: d, days: 1, label: `${d.getMonth() + 1}/${d.getDate()}` };
    });
    return { scale, windowStart, totalDays, columns, minTrackWidth: 660 };
  }

  if (scale === "week") {
    const windowStart = startOfWeek(anchor);
    const weekCount = 10;
    const columns: GanttColumn[] = Array.from({ length: weekCount }, (_, i) => {
      const d = addDaysDate(windowStart, i * 7);
      return { start: d, days: 7, label: `${d.getMonth() + 1}/${d.getDate()}` };
    });
    return { scale, windowStart, totalDays: weekCount * 7, columns, minTrackWidth: 600 };
  }

  // month
  const windowStart = startOfMonth(anchor);
  const monthCount = 3;
  const columns: GanttColumn[] = [];
  let cursor = windowStart;
  for (let i = 0; i < monthCount; i++) {
    const next = addMonthsDate(cursor, 1);
    const days = dayDiff(cursor, next);
    columns.push({ start: cursor, days, label: `${cursor.getMonth() + 1}月` });
    cursor = next;
  }
  const totalDays = dayDiff(windowStart, cursor);
  return { scale, windowStart, totalDays, columns, minTrackWidth: "100%" };
}

// 窓に対する百分率で位置・幅を返す（スケールによらず同じ計算式が使える）。
// 窓の範囲外にはみ出す場合は窓の内側にクランプし、完全に窓外なら描画しない。
export function barFor(nodes: ProgressTask[], node: ProgressTask, win: GanttWindow): { leftPct: number; widthPct: number } | null {
  const range = effectiveRange(nodes, node);
  if (!range) return null;
  const startOffset = dayDiff(win.windowStart, toDate(range.start));
  const endOffset = dayDiff(win.windowStart, toDate(range.end)) + 1; // 終了日を含む排他的な終端
  const clampedStart = Math.max(0, startOffset);
  const clampedEnd = Math.min(win.totalDays, endOffset);
  if (clampedEnd <= clampedStart) return null;
  return {
    leftPct: (clampedStart / win.totalDays) * 100,
    widthPct: ((clampedEnd - clampedStart) / win.totalDays) * 100,
  };
}

export function todayOffsetPct(win: GanttWindow): number | null {
  const offset = dayDiff(win.windowStart, todayDate());
  if (offset < 0 || offset >= win.totalDays) return null;
  return (offset / win.totalDays) * 100;
}
