import { listEffortLogs, createEffortLog, deleteEffortLog } from "@/actions/effort-logs";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { InlineErrorForm } from "@/components/ui/inline-error-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function EffortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logs = await listEffortLogs(id);
  const totalHours = logs.reduce((sum, l) => sum + Number(l.hours_spent), 0);

  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id;
  const addLog = createEffortLog.bind(null, id, tenantId ?? "");

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <PageHeader
        title="工数記録"
        action={<span className="text-sm text-secondary">合計 {totalHours.toFixed(1)} 時間</span>}
      />

      <InlineErrorForm action={addLog} className="grid grid-cols-4 gap-2 mb-5 items-end">
        <div>
          <Label>開始日</Label>
          <Input name="work_start_date" type="date" required className="w-full" />
        </div>
        <div>
          <Label>終了日</Label>
          <Input name="work_end_date" type="date" required className="w-full" />
        </div>
        <div>
          <Label>実績時間</Label>
          <Input name="hours_spent" type="number" step="0.5" min="0.5" required className="w-full" />
        </div>
        <Button type="submit" variant="primary" size="md">記録</Button>
        <Input name="note" placeholder="メモ（任意）" className="col-span-4" />
      </InlineErrorForm>

      <div className="flex flex-col">
        {logs.map((log) => (
          <div key={log.id} className="grid grid-cols-4 items-center py-2 border-t border-hover text-sm">
            <span>{log.work_start_date}</span>
            <span>{log.work_end_date}</span>
            <span>{log.hours_spent}時間</span>
            <div className="flex justify-between items-center gap-2">
              <span className="text-secondary text-xs break-words min-w-0">{log.note}</span>
              {log.recorded_by === currentUserId && (
                <form action={deleteEffortLog.bind(null, log.id, id)}>
                  <ConfirmDeleteButton />
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
