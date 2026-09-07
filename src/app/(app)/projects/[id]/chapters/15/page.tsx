import { listProgressTasks, addProgressTask, deleteProgressTask } from "@/actions/progress-tasks";
import { GanttChart } from "@/components/domain/gantt/GanttChart";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { PageHeader } from "@/components/ui/page-header";

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await listProgressTasks(id);
  const addTask = addProgressTask.bind(null, id);

  return (
    <Card className="max-w-4xl mx-auto mt-10">
      <PageHeader title="15. 進捗" />

      <GanttChart projectId={id} tasks={tasks} />

      <form action={addTask} className="grid grid-cols-5 gap-2 mt-6 items-end">
        <Input name="task_name" placeholder="タスク名" required />
        <Input name="owner_primary" placeholder="主担当" />
        <Input name="owner_secondary" placeholder="副担当" />
        <Input name="week_start" type="date" required />
        <Input name="week_end" type="date" required />
        <Button type="submit" variant="primary" size="md" className="col-span-5">+ タスク追加</Button>
      </form>

      <div className="mt-3 flex flex-col gap-1">
        {tasks.map((t) => (
          <form key={t.id} action={deleteProgressTask.bind(null, t.id, id)} className="flex justify-between text-xs">
            <span className="text-secondary">{t.task_name}</span>
            <ConfirmDeleteButton />
          </form>
        ))}
      </div>
    </Card>
  );
}
