# 指示書：Phase1 Step7 工数記録

## 目的

案件ごとに、作業期間（開始日・終了日）と、その期間内に実際に使った工数（時間）をSEが手動入力できるようにする。KPI（要件定義工数40%削減）の実績検証データとして使う。詳細は `docs/01_requirements.md` §9（機能No.14）・§4（KPI測定方法）を参照。

## 前提確認

- Phase1 Step6（曖昧表現検出）が完了していること

---

## Step 1: effort_logs テーブルを作成

```bash
supabase migration new add_effort_logs
```

```sql
create table effort_logs (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id),
  tenant_id      uuid not null,
  recorded_by    uuid references user_profiles(user_id),
  work_start_date date not null,
  work_end_date   date not null,
  hours_spent     numeric(6,2) not null check (hours_spent > 0),
  note            text,
  created_at      timestamptz default now(),
  constraint valid_date_range check (work_end_date >= work_start_date)
);

alter table effort_logs enable row level security;

-- CLAUDE.md規約12のチェックリストに従い、RLS・GRANTをセットで作成する
grant select, insert, update, delete on effort_logs to authenticated;

create policy "effort_logs_select" on effort_logs
  for select using (is_project_member(project_id));

create policy "effort_logs_insert" on effort_logs
  for insert with check (is_project_member(project_id));

-- 記録した本人のみ編集・削除可（他人の入力を誤って書き換えないようにする）
create policy "effort_logs_update" on effort_logs
  for update using (recorded_by = auth.uid());

create policy "effort_logs_delete" on effort_logs
  for delete using (recorded_by = auth.uid());
```

`supabase db reset` で反映する。

## Step 2: Server Actionsを作成

新規ファイル `src/actions/effort-logs.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type EffortLog = {
  id: string;
  work_start_date: string;
  work_end_date: string;
  hours_spent: number;
  note: string | null;
  recorded_by: string;
};

export async function listEffortLogs(projectId: string): Promise<EffortLog[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("effort_logs")
    .select("id, work_start_date, work_end_date, hours_spent, note, recorded_by")
    .eq("project_id", projectId)
    .order("work_start_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createEffortLog(
  projectId: string,
  tenantId: string,
  formData: FormData
) {
  const supabase = await createServerActionClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("認証が必要です");

  const workStartDate = formData.get("work_start_date") as string;
  const workEndDate = formData.get("work_end_date") as string;
  const hoursSpent = Number(formData.get("hours_spent"));
  const note = (formData.get("note") as string) || null;

  const { error } = await supabase.from("effort_logs").insert({
    project_id: projectId,
    tenant_id: tenantId,
    recorded_by: userData.user.id,
    work_start_date: workStartDate,
    work_end_date: workEndDate,
    hours_spent: hoursSpent,
    note,
  });
  if (error) throw error;

  revalidatePath(`/projects/${projectId}/effort`);
}

export async function deleteEffortLog(logId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("effort_logs").delete().eq("id", logId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/effort`);
}
```

## Step 3: 工数記録画面を作成

新規ファイル `src/app/projects/[id]/effort/page.tsx`。

```tsx
import { listEffortLogs, createEffortLog, deleteEffortLog } from "@/actions/effort-logs";
import { createServerActionClient } from "@/lib/supabase/server";

export default async function EffortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logs = await listEffortLogs(id);
  const totalHours = logs.reduce((sum, l) => sum + Number(l.hours_spent), 0);

  const supabase = await createServerActionClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const tenantId = (sessionData.session as any)?.access_token_claims?.tenant_id;
  const addLog = createEffortLog.bind(null, id, tenantId);

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-base font-semibold text-primary">工数記録</h1>
        <span className="text-sm text-secondary">合計 {totalHours.toFixed(1)} 時間</span>
      </div>

      <form action={addLog} className="grid grid-cols-4 gap-2 mb-5 items-end">
        <div>
          <label className="text-xs text-secondary block mb-1">開始日</label>
          <input name="work_start_date" type="date" required className="w-full h-9 border border-border rounded-md px-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-secondary block mb-1">終了日</label>
          <input name="work_end_date" type="date" required className="w-full h-9 border border-border rounded-md px-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-secondary block mb-1">実績時間</label>
          <input name="hours_spent" type="number" step="0.5" min="0.5" required className="w-full h-9 border border-border rounded-md px-2 text-sm" />
        </div>
        <button type="submit" className="h-9 bg-primary text-white rounded-md text-sm font-medium">
          記録
        </button>
        <input name="note" placeholder="メモ（任意）" className="col-span-4 h-9 border border-border rounded-md px-2 text-sm" />
      </form>

      <div className="flex flex-col">
        {logs.map((log) => (
          <div key={log.id} className="grid grid-cols-4 items-center py-2 border-t border-[#F1F1EF] text-sm">
            <span>{log.work_start_date}</span>
            <span>{log.work_end_date}</span>
            <span>{log.hours_spent}時間</span>
            <div className="flex justify-between items-center">
              <span className="text-secondary text-xs truncate">{log.note}</span>
              <form action={deleteEffortLog.bind(null, log.id, id)}>
                <button className="text-xs text-faint">削除</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 4: 動作確認

1. `/projects/{id}/effort` にアクセス
2. 開始日・終了日・実績時間（例：開始2026/08/01、終了2026/08/03、8時間）を入力し「記録」
3. 一覧に追加され、合計時間が更新されることを確認
4. 自分が記録した行のみ「削除」できることを確認（RLSにより他人の記録は削除できない設計だが、Phase1では他人の記録がUI上に見える化はしていないため、複数ユーザーでのテストは任意）
5. `work_end_date`が`work_start_date`より前の日付だと保存時にエラーになることを確認（DB制約`valid_date_range`）

## やってはいけないこと

- 工数記録の値を、確定判定（Phase3）の充足率計算に混在させない（工数記録とステータス管理は独立した機能）
- 他人が記録した`effort_logs`行を更新・削除できるUIを作らない（RLSでも防いでいるが、UI上でボタン自体を出さない配慮も行う）

## 完了条件

- [ ] `effort_logs`テーブル・RLS・GRANT作成済み
- [ ] 記録・一覧・削除のServer Actions実装済み
- [ ] 工数記録画面で入力・合計表示・削除が動作確認済み
