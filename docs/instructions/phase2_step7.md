# 指示書：Phase2 Step7 進捗ガントチャート

## 目的

15章（進捗）を、週単位のガントチャートとして管理する。既存の社内アーキ資産（PM Vision）と同様、外部ライブラリに依存しないカスタムSVG実装とする（`docs/02_architecture.md` 1章「本システムの構成」の方針を踏襲。PM Vision本体のコードは別リポジトリのため、直接の流用ではなく同じ実装方針＝カスタムSVGを採用する）。詳細は `docs/01_requirements.md` §9（機能No.7）を参照。

## 前提確認

- Phase2 Step6（画面遷移図・項目定義・外部IF定義）が完了していること
- `progress_tasks`テーブルは`02_architecture.md`に定義済みだが、実際の作成状況・RLS/GRANTの有無をCLAUDE.md規約23に従い確認すること

---

## Step 1: progress_tasks の存在確認とRLS・GRANTの整備

```bash
supabase migration new setup_progress_tasks
```

```sql
create table if not exists progress_tasks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id),
  tenant_id        uuid not null,
  task_name        text not null,
  owner_primary    text,
  owner_secondary  text,
  week_start       date not null,
  week_end         date not null,
  percent_complete int not null default 0 check (percent_complete between 0 and 100),
  constraint valid_task_range check (week_end >= week_start)
);

-- テーブルが既に存在していた場合に備え、不足列・制約を個別に補う（CLAUDE.md規約23）
alter table progress_tasks add column if not exists tenant_id uuid;
alter table progress_tasks add column if not exists percent_complete int not null default 0;

alter table progress_tasks enable row level security;
grant select, insert, update, delete on progress_tasks to authenticated;

create policy "progress_tasks_select" on progress_tasks for select using (is_project_member(project_id));
create policy "progress_tasks_insert" on progress_tasks for insert with check (is_project_member(project_id));
create policy "progress_tasks_update" on progress_tasks for update using (is_project_member(project_id));
create policy "progress_tasks_delete" on progress_tasks for delete using (is_project_member(project_id));
```

`supabase db reset` で反映する。反映後、`docs/02_architecture.md` 4章にこのRLSを追記すること。

## Step 2: ガントチャートのレイアウト計算ロジックを作成

新規ファイル `src/lib/gantt/layout.ts`（通常モジュール）。

```ts
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
```

## Step 3: Server Actionsを作成

新規ファイル `src/actions/progress-tasks.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ProgressTask } from "@/lib/gantt/layout";

export async function listProgressTasks(projectId: string): Promise<ProgressTask[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("progress_tasks")
    .select("id, task_name, owner_primary, owner_secondary, week_start, week_end, percent_complete")
    .eq("project_id", projectId)
    .order("week_start");
  if (error) throw error;
  return data;
}

export async function addProgressTask(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { error } = await supabase.from("progress_tasks").insert({
    project_id: projectId,
    tenant_id: tenantId,
    task_name: formData.get("task_name") as string,
    owner_primary: formData.get("owner_primary") as string,
    owner_secondary: formData.get("owner_secondary") as string,
    week_start: formData.get("week_start") as string,
    week_end: formData.get("week_end") as string,
    percent_complete: 0,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/15`);
}

export async function updatePercentComplete(taskId: string, projectId: string, percent: number) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("progress_tasks")
    .update({ percent_complete: percent })
    .eq("id", taskId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/15`);
}

export async function deleteProgressTask(taskId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("progress_tasks").delete().eq("id", taskId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/15`);
}
```

## Step 4: ガントチャートコンポーネントを作成

新規ファイル `src/components/domain/gantt/GanttChart.tsx`（クライアントコンポーネント。%進捗の変更をインタラクティブに行うため）。

```tsx
"use client";

import { useTransition } from "react";
import { updatePercentComplete } from "@/actions/progress-tasks";
import { computeGanttLayout, GANTT_CONSTANTS, type ProgressTask } from "@/lib/gantt/layout";

const { WEEK_WIDTH, ROW_HEIGHT, LABEL_WIDTH } = GANTT_CONSTANTS;

export function GanttChart({ projectId, tasks }: { projectId: string; tasks: ProgressTask[] }) {
  const [isPending, startTransition] = useTransition();

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
            <line x1={LABEL_WIDTH + i * WEEK_WIDTH} y1={0} x2={LABEL_WIDTH + i * WEEK_WIDTH} y2={layout.height} stroke="#F1F1EF" />
            <text x={LABEL_WIDTH + i * WEEK_WIDTH + 4} y={12} fontSize={10} fill="#9B9A97">
              {`${w.getMonth() + 1}/${w.getDate()}`}
            </text>
          </g>
        ))}

        {tasks.map((task, i) => {
          const bar = layout.barFor(task);
          const fillWidth = (bar.width * task.percent_complete) / 100;
          return (
            <g key={task.id}>
              <text x={8} y={i * ROW_HEIGHT + 20} fontSize={12} fill="#37352F">{task.task_name}</text>
              <text x={8} y={i * ROW_HEIGHT + 34} fontSize={10} fill="#9B9A97">
                {task.owner_primary}{task.owner_secondary ? ` / ${task.owner_secondary}` : ""}
              </text>
              <rect x={bar.x} y={bar.y + 8} width={bar.width} height={24} rx={4} fill="#F1F1EF" stroke="#E9E9E7" />
              <rect x={bar.x} y={bar.y + 8} width={fillWidth} height={24} rx={4} fill="#DBEDDB" />
              <text x={bar.x + bar.width + 8} y={bar.y + 24} fontSize={11} fill="#787774">{task.percent_complete}%</text>
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
```

**注意**：進捗％の変更はSVG外のスライダーで行う設計にしている（SVG内に`<input>`を直接配置するとブラウザ間の表示崩れが起きやすいため）。SVGのバー内の緑色の塗り（`fill="#DBEDDB"`）は、スライダー操作後の`revalidatePath`によって再描画される。

## Step 5: 15章ページを作成

新規ファイル `src/app/projects/[id]/chapters/15/page.tsx`（4章・10章と同様、固定ルート。CLAUDE.md規約19に従い、`[chapterNo]`側の対応表から15を除外すること）。

```tsx
import { listProgressTasks, addProgressTask, deleteProgressTask } from "@/actions/progress-tasks";
import { GanttChart } from "@/components/domain/gantt/GanttChart";

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await listProgressTasks(id);
  const addTask = addProgressTask.bind(null, id);

  return (
    <div className="max-w-4xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">15. 進捗</h1>

      <GanttChart projectId={id} tasks={tasks} />

      <form action={addTask} className="grid grid-cols-5 gap-2 mt-6 items-end">
        <input name="task_name" placeholder="タスク名" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="owner_primary" placeholder="主担当" className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="owner_secondary" placeholder="副担当" className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="week_start" type="date" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="week_end" type="date" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <button className="h-9 col-span-5 bg-primary text-white rounded-md text-sm font-medium">+ タスク追加</button>
      </form>

      <div className="mt-3 flex flex-col gap-1">
        {tasks.map((t) => (
          <form key={t.id} action={deleteProgressTask.bind(null, t.id, id)} className="flex justify-between text-xs">
            <span className="text-secondary">{t.task_name}</span>
            <button className="text-faint">削除</button>
          </form>
        ))}
      </div>
    </div>
  );
}
```

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`の`CHAPTER_TEMPLATE_MAP`に`15`が含まれていないことを確認する（元々マッピングしていないはずだが、念のため確認）。

## Step 6: 動作確認

1. `/projects/{id}/chapters/15` にアクセスし、タスクを2〜3件（週をまたぐ期間で）追加する
2. ガントチャートに週目盛りとタスクバーが表示されることを確認
3. スライダーで進捗％を変更し、バーの緑色部分が連動して伸縮することを確認
4. タスクを1件削除し、ガントチャートから消えることを確認
5. タスクが0件の状態で「まだタスクがありません」と表示され、SVGレンダリング時にエラーが出ないことを確認（週の範囲が計算できないケースのガード）

## やってはいけないこと

- 外部のガントチャート用ライブラリ（frappe-gantt等）を新規に追加しない（PM Visionの方針を踏襲し、カスタムSVGで実装する）
- 進捗％の入力を0〜100の範囲外で保存できる状態にしない（DB制約`check (percent_complete between 0 and 100)`を維持する）

## 完了条件

- [ ] `progress_tasks`のRLS・GRANT・不足列の確認・整備済み
- [ ] `docs/02_architecture.md` 4章に追記済み
- [ ] ガントチャートの表示・進捗％変更・タスク追加・削除が動作確認済み
