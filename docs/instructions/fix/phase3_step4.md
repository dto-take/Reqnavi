# 指示書：Phase3 Step4 ベースライン確定

## 目的

PM/管理者が、その時点の要件定義内容を「確定版」としてスナップショット化する。以降の変更は次Step（差分管理）で扱う。既存の`baseline_snapshots`/`baseline_item_snapshots`テーブル定義（`docs/02_architecture.md` 2.4節）を使う。詳細は `docs/01_requirements.md` §9（機能No.12）を参照。

## スコープの限定

- スナップショット対象は**`requirement_items`（テンプレートA〜E全て）のみ**とする。業務フロー（`flow_nodes`/`flow_edges`）・進捗（`progress_tasks`）のスナップショットは対象外とし、将来必要になった場合に別Stepで拡張する。
- 充足率が低い状態でもベースライン確定自体はブロックしない（警告表示のみ）。最終判断はPM/管理者に委ねる（これまでの「気づきの提示、最終判断はSE/PM」という方針を踏襲）。

## 前提確認

- Phase3 Step3（整合性チェック）が完了していること
- `baseline_snapshots`/`baseline_item_snapshots`は`02_architecture.md`に定義済みだが、実際の作成・RLS状況をCLAUDE.md規約23に従い確認すること

---

## Step 1: テーブルの存在確認とRLS・GRANTの整備

```bash
supabase migration new setup_baseline_tables
```

```sql
create table if not exists baseline_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id),
  tenant_id     uuid not null,
  version_no    text not null,
  status        text not null default 'active',
  approved_by   uuid references user_profiles(user_id),
  approval_note text,
  readiness_snapshot jsonb,
  created_at    timestamptz default now()
);

create table if not exists baseline_item_snapshots (
  id            uuid primary key default gen_random_uuid(),
  baseline_id   uuid references baseline_snapshots(id) on delete cascade,
  item_id       uuid not null,
  chapter_no    int,
  template_type text,
  content       jsonb,
  status_at_baseline text
);

alter table baseline_snapshots add column if not exists tenant_id uuid;

alter table baseline_snapshots enable row level security;
alter table baseline_item_snapshots enable row level security;

grant select, insert, update, delete on baseline_snapshots to authenticated;
grant select, insert, update, delete on baseline_item_snapshots to authenticated;

create policy "baseline_snapshots_select" on baseline_snapshots for select using (is_project_member(project_id));
create policy "baseline_snapshots_insert" on baseline_snapshots for insert with check (
  (auth.jwt() ->> 'user_role') in ('admin','pm') and is_project_member(project_id)
);
create policy "baseline_snapshots_update" on baseline_snapshots for update using (
  (auth.jwt() ->> 'user_role') in ('admin','pm') and is_project_member(project_id)
);

-- baseline_item_snapshotsはproject_idを直接持たないため、baseline_snapshots経由で判定する（規約21）
create policy "baseline_item_snapshots_select" on baseline_item_snapshots for select using (
  baseline_id in (select id from baseline_snapshots where is_project_member(project_id))
);
create policy "baseline_item_snapshots_insert" on baseline_item_snapshots for insert with check (
  baseline_id in (select id from baseline_snapshots where is_project_member(project_id))
);
```

`supabase db reset` で反映する。反映後、`docs/02_architecture.md` 4章に追記すること。

## Step 2: ベースライン確定のServer Actionを作成

新規ファイル `src/actions/baseline.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getReadinessSummary } from "@/actions/readiness";
import { revalidatePath } from "next/cache";

export async function getActiveBaseline(projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("baseline_snapshots")
    .select("id, version_no, approval_note, created_at, readiness_snapshot")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createBaseline(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new Error("PM以上の権限が必要です");
  }
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("認証が必要です");

  const approvalNote = formData.get("approval_note") as string;
  const readinessSnapshot = await getReadinessSummary(projectId);

  const { count } = await supabase
    .from("baseline_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  await supabase
    .from("baseline_snapshots")
    .update({ status: "superseded" })
    .eq("project_id", projectId)
    .eq("status", "active");

  const versionNo = `v1.${count ?? 0}`;

  const { data: baseline, error: baselineError } = await supabase
    .from("baseline_snapshots")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      version_no: versionNo,
      status: "active",
      approved_by: userData.user.id,
      approval_note: approvalNote,
      readiness_snapshot: readinessSnapshot,
    })
    .select("id")
    .single();
  if (baselineError || !baseline) throw baselineError ?? new Error("ベースライン作成に失敗しました");

  const { data: items, error: itemsError } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, template_type, content, status")
    .eq("project_id", projectId);
  if (itemsError) throw itemsError;

  if (items && items.length > 0) {
    const snapshotRows = items.map((item) => ({
      baseline_id: baseline.id,
      item_id: item.id,
      chapter_no: item.chapter_no,
      template_type: item.template_type,
      content: item.content,
      status_at_baseline: item.status,
    }));
    const { error: snapshotError } = await supabase.from("baseline_item_snapshots").insert(snapshotRows);
    if (snapshotError) throw snapshotError;
  }

  revalidatePath(`/projects/${projectId}/baseline`);
}
```

**注意**：`versionNo`は既存ベースライン件数から単純に採番する簡易実装（`v1.0` → `v1.1` → ...）。`approved_by`には`supabase.auth.getUser()`から取得した確実なユーザーIDを使用している（クレームからの取得は構造がSDKバージョン依存のため避けた）。

## Step 3: ベースライン画面を作成

新規ファイル `src/app/projects/[id]/baseline/page.tsx`。

```tsx
import { getActiveBaseline, createBaseline } from "@/actions/baseline";
import { createServerActionClient } from "@/lib/supabase/server";

export default async function BaselinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const baseline = await getActiveBaseline(id);

  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const canApprove = ["admin", "pm"].includes(claims?.claims?.user_role as string);

  const readiness = (baseline?.readiness_snapshot as { chapterNo: number; readinessRate: number }[]) ?? [];
  const avgReadiness = readiness.length > 0
    ? Math.round(readiness.reduce((sum, r) => sum + r.readinessRate, 0) / readiness.length)
    : 0;

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">ベースライン管理</h1>

      {baseline ? (
        <div className="mb-6 p-4 bg-sidebar rounded-md">
          <div className="text-sm font-medium text-primary">{baseline.version_no}（確定中）</div>
          <div className="text-xs text-secondary mt-1">確定日：{new Date(baseline.created_at).toLocaleDateString("ja-JP")}</div>
          <div className="text-xs text-secondary">平均充足率（確定時点）：{avgReadiness}%</div>
          {baseline.approval_note && <div className="text-xs text-secondary mt-1">メモ：{baseline.approval_note}</div>}
        </div>
      ) : (
        <p className="text-sm text-secondary mb-6">まだベースラインが確定されていません</p>
      )}

      {canApprove ? (
        <form action={createBaseline.bind(null, id)} className="flex flex-col gap-2">
          <textarea
            name="approval_note"
            placeholder="確定メモ（任意）"
            className="border border-border rounded-md px-2 py-1.5 text-sm"
            rows={2}
          />
          <button className="h-9 bg-primary text-white rounded-md text-sm font-medium">
            {baseline ? "新しいベースラインとして再確定" : "ベースラインを確定"}
          </button>
          <p className="text-[11px] text-faint">
            現在の充足率に関わらず確定できます。事前に確定判定ダッシュボード・整合性チェックの確認を推奨します。
          </p>
        </form>
      ) : (
        <p className="text-xs text-faint">ベースラインの確定にはPM以上の権限が必要です</p>
      )}
    </div>
  );
}
```

## Step 4: サイドバーに導線を追加

`src/app/projects/[id]/layout.tsx`に追加する。

```tsx
<Link href={`/projects/${id}/baseline`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
  ベースライン
</Link>
```

## Step 5: 動作確認

1. member権限のユーザーで`/projects/{id}/baseline`にアクセスし、確定ボタンが表示されない（権限メッセージのみ）ことを確認
2. pm権限のユーザーで同画面にアクセスし、確定メモを入力してベースラインを確定する
3. `baseline_snapshots`に`v1.0`、`status='active'`の行が作成され、`baseline_item_snapshots`に現時点の全`requirement_items`のコピーが作成されることを確認
4. `approved_by`が正しいユーザーIDになっていることを確認
5. 何らかの項目を編集した後、再度ベースラインを確定し、`v1.1`が作成され、`v1.0`が`status='superseded'`に変わることを確認
6. 画面上、常に最新の`active`ベースラインのみが表示されることを確認

## やってはいけないこと

- member/partnerロールでベースライン確定ができる状態にしない（RLS・アプリ層の両方でPM以上に限定する）
- `baseline_item_snapshots`作成後、元の`requirement_items`を変更・削除しない（このStepではスナップショットの作成のみ。差分管理はStep5で対応）

## 完了条件

- [ ] `baseline_snapshots`/`baseline_item_snapshots`のRLS・GRANT整備済み
- [ ] `docs/02_architecture.md` 4章に追記済み
- [ ] ベースライン確定・再確定（supersede）が動作確認済み
- [ ] 権限制御（PM以上のみ）が機能していることを確認済み
