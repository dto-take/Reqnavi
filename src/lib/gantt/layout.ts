export type ProgressTask = {
  id: string;
  task_name: string;
  owner_primary: string | null;
  owner_secondary: string | null;
  week_start: string; // ISO date
  week_end: string;
  percent_complete: number;
};

const WEEK_WIDTH = 60;
const ROW_HEIGHT = 44;
const LABEL_WIDTH = 220;

export type GanttLayout = {
  weekStarts: Date[];
  width: number;
  height: number;
  barFor: (task: ProgressTask) => { x: number; width: number; y: number };
};

function toMonday(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  return result;
}

export function computeGanttLayout(tasks: ProgressTask[]): GanttLayout {
  if (tasks.length === 0) {
    return { weekStarts: [], width: LABEL_WIDTH, height: ROW_HEIGHT, barFor: () => ({ x: 0, width: 0, y: 0 }) };
  }

  const allStarts = tasks.map((t) => toMonday(new Date(t.week_start)));
  const allEnds = tasks.map((t) => toMonday(new Date(t.week_end)));
  const minDate = new Date(Math.min(...allStarts.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...allEnds.map((d) => d.getTime())));

  const weekStarts: Date[] = [];
  const cursor = new Date(minDate);
  while (cursor <= maxDate) {
    weekStarts.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  function weekIndex(d: Date): number {
    return Math.round((toMonday(d).getTime() - minDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  }

  function barFor(task: ProgressTask) {
    const startIdx = weekIndex(new Date(task.week_start));
    const endIdx = weekIndex(new Date(task.week_end));
    const rowIdx = tasks.findIndex((t) => t.id === task.id);
    return {
      x: LABEL_WIDTH + startIdx * WEEK_WIDTH,
      width: (endIdx - startIdx + 1) * WEEK_WIDTH,
      y: rowIdx * ROW_HEIGHT,
    };
  }

  return {
    weekStarts,
    width: LABEL_WIDTH + weekStarts.length * WEEK_WIDTH,
    height: tasks.length * ROW_HEIGHT + 30,
    barFor,
  };
}

export const GANTT_CONSTANTS = { WEEK_WIDTH, ROW_HEIGHT, LABEL_WIDTH };
