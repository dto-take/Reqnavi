"use client";

import { useTransition } from "react";
import { updatePercentComplete } from "@/actions/progress-tasks";
import { useGlobalPending } from "@/components/ui/loading-overlay";
import { computeGanttLayout, GANTT_CONSTANTS, type ProgressTask } from "@/lib/gantt/layout";

const { WEEK_WIDTH, ROW_HEIGHT, LABEL_WIDTH } = GANTT_CONSTANTS;

export function GanttChart({ projectId, tasks }: { projectId: string; tasks: ProgressTask[] }) {
  const [isPending, startTransition] = useTransition();
  useGlobalPending(isPending);

  if (tasks.length === 0) {
    return <div className="text-sm text-secondary py-6 text-center">まだタスクがありません</div>;
  }

  const layout = computeGanttLayout(tasks);

  function handlePercentChange(taskId: string, value: number) {
    startTransition(() => updatePercentComplete(taskId, projectId, value));
  }

  return (
    <div className="overflow-x-auto">
      <svg width={layout.width} height={layout.height} className="border border-border rounded-lg">
        {layout.weekStarts.map((w, i) => (
          <g key={i}>
            <line x1={LABEL_WIDTH + i * WEEK_WIDTH} y1={0} x2={LABEL_WIDTH + i * WEEK_WIDTH} y2={layout.height} stroke="var(--bg-hover)" />
            <text x={LABEL_WIDTH + i * WEEK_WIDTH + 4} y={12} fontSize={10} fill="var(--text-faint)">
              {`${w.getMonth() + 1}/${w.getDate()}`}
            </text>
          </g>
        ))}

        {tasks.map((task, i) => {
          const bar = layout.barFor(task);
          const fillWidth = (bar.width * task.percent_complete) / 100;
          return (
            <g key={task.id}>
              <text x={8} y={i * ROW_HEIGHT + 20} fontSize={12} fill="var(--text-primary)">{task.task_name}</text>
              <text x={8} y={i * ROW_HEIGHT + 34} fontSize={10} fill="var(--text-faint)">
                {task.owner_primary}{task.owner_secondary ? ` / ${task.owner_secondary}` : ""}
              </text>
              <rect x={bar.x} y={bar.y + 8} width={bar.width} height={24} rx={4} fill="var(--bg-hover)" stroke="var(--border)" />
              <rect x={bar.x} y={bar.y + 8} width={fillWidth} height={24} rx={4} fill="var(--status-confirmed-bg)" />
              <text x={bar.x + bar.width + 8} y={bar.y + 24} fontSize={11} fill="var(--text-secondary)">{task.percent_complete}%</text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-col gap-1.5">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 text-xs">
            <span className="w-40 truncate">{task.task_name}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={task.percent_complete}
              disabled={isPending}
              onChange={(e) => handlePercentChange(task.id, Number(e.target.value))}
              className="flex-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
