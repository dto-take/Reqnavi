# 指示書：Phase2 Step1 業務フロー データモデル・テキスト入力

## 目的

As-Is/To-Be業務フローを、まずは可視化なしの構造化箇条書き（担当者・処理内容・使用システム・順序）として入力・管理できるようにする。可視化（スイムレート図）はStep2、ドラッグ編集はStep3で対応する。詳細は `docs/01_requirements.md` §9（機能No.5）・`docs/02_architecture.md` 2.3節を参照。

## 前提確認

- Phase1（Step1〜9）がすべて完了していること
- `flow_nodes`/`flow_edges`テーブルは`02_architecture.md`に定義済みだが、実際にマイグレーションを実行したかは不明。**CLAUDE.md規約23に従い、存在確認から始めること。**

---

## Step 1: flow_nodes / flow_edges の存在確認と不足分の追加

まず以下で現状を確認する。

```bash
supabase db diff --schema public 2>&1 | grep -A5 "flow_nodes\|flow_edges"
```

または Supabase Studio の Table Editor で`flow_nodes`/`flow_edges`が存在するか目視確認する。

**テーブルが存在しない場合**、新規マイグレーションで作成する。**存在する場合**、以下の列・RLS・GRANTが不足していないか確認し、無ければ追加する。

```bash
supabase migration new setup_flow_tables
```

```sql
-- テーブルが無い場合のみ実行（存在する場合はこのcreate tableをスキップし、以下のalter/RLS/GRANTのみ実行）
create table if not exists flow_nodes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  tenant_id  uuid not null,
  flow_type  text not null check (flow_type in ('business_asis', 'business_tobe', 'screen_transition')),
  label      text not null,
  role_lane  text,
  system_used text,      -- 本Stepで追加（使用システム。当初のarchitecture.mdには無かった列）
  order_index int not null default 0, -- 本Stepで追加（テキスト入力時の順序。Step3の座標より先に必要）
  pos_x int, pos_y int
);

create table if not exists flow_edges (
  id        uuid primary key default gen_random_uuid(),
  from_node uuid references flow_nodes(id) on delete cascade,
  to_node   uuid references flow_nodes(id) on delete cascade,
  label     text
);

-- 既存テーブルに列が無い場合のための保険（if not existsなので重複実行しても安全）
alter table flow_nodes add column if not exists system_used text;
alter table flow_nodes add column if not exists order_index int not null default 0;
alter table flow_nodes add column if not exists tenant_id uuid;

alter table flow_nodes enable row level security;
alter table flow_edges enable row level security;

grant select, insert, update, delete on flow_nodes to authenticated;
grant select, insert, update, delete on flow_edges to authenticated;

create policy "flow_nodes_select" on flow_nodes for select using (is_project_member(project_id));
create policy "flow_nodes_insert" on flow_nodes for insert with check (is_project_member(project_id));
create policy "flow_nodes_update" on flow_nodes for update using (is_project_member(project_id));
create policy "flow_nodes_delete" on flow_nodes for delete using (is_project_member(project_id));

-- flow_edgesはproject_idを持たないため、flow_nodes経由で判定する（CLAUDE.md規約21）
create policy "flow_edges_select" on flow_edges for select using (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);
create policy "flow_edges_insert" on flow_edges for insert with check (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);
create policy "flow_edges_delete" on flow_edges for delete using (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);
```

`supabase db reset` で反映する。反映後、`docs/02_architecture.md` 2.3節に`system_used`・`order_index`列と上記RLSを追記すること。

## Step 2: Server Actionsを作成

新規ファイル `src/actions/business-flow.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type FlowType = "business_asis" | "business_tobe";

export type FlowStep = {
  id: string;
  label: string;
  role_lane: string | null;
  system_used: string | null;
  order_index: number;
};

export async function listFlowSteps(projectId: string, flowType: FlowType): Promise<FlowStep[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .select("id, label, role_lane, system_used, order_index")
    .eq("project_id", projectId)
    .eq("flow_type", flowType)
    .order("order_index");
  if (error) throw error;
  return data;
}

export async function addFlowStep(
  projectId: string,
  flowType: FlowType,
  formData: FormData
) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { data: existing } = await supabase
    .from("flow_nodes")
    .select("order_index")
    .eq("project_id", projectId)
    .eq("flow_type", flowType)
    .order("order_index", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

  const { error } = await supabase.from("flow_nodes").insert({
    project_id: projectId,
    tenant_id: tenantId,
    flow_type: flowType,
    label: formData.get("label") as string,
    role_lane: formData.get("role_lane") as string,
    system_used: formData.get("system_used") as string,
    order_index: nextOrder,
  });
  if (error) throw error;

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}

export async function deleteFlowStep(stepId: string, projectId: string, flowType: FlowType) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("flow_nodes").delete().eq("id", stepId);
  if (error) throw error;

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}

// order_indexの並び順に沿って、連続するステップ間のedgeを再生成する
// （Step1では手動でのedge編集は行わず、リストの並び＝フローの順序とする）
async function regenerateEdges(projectId: string, flowType: FlowType) {
  const supabase = await createServerActionClient();
  const { data: nodes } = await supabase
    .from("flow_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("flow_type", flowType)
    .order("order_index");
  if (!nodes) return;

  const nodeIds = nodes.map((n) => n.id);
  await supabase.from("flow_edges").delete().in("from_node", nodeIds);

  const newEdges = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    newEdges.push({ from_node: nodeIds[i], to_node: nodeIds[i + 1] });
  }
  if (newEdges.length > 0) {
    await supabase.from("flow_edges").insert(newEdges);
  }
}
```

**注意**：`regenerateEdges`は毎回全削除→再作成という単純な実装にしている。ステップ数が多い案件でパフォーマンス上の懸念が出た場合は差分更新に変更を検討するが、Phase2 Step1の時点では簡潔さを優先する。

## Step 3: 業務フロー入力画面を作成

新規ファイル `src/app/projects/[id]/business-flow/page.tsx`。As-Is/To-Beをタブで切り替える。

```tsx
import { listFlowSteps, addFlowStep, deleteFlowStep, type FlowType } from "@/actions/business-flow";

export default async function BusinessFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const flowType: FlowType = tab === "tobe" ? "business_tobe" : "business_asis";

  const steps = await listFlowSteps(id, flowType);
  const addStep = addFlowStep.bind(null, id, flowType);

  return (
    <div className="max-w-3xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <div className="flex gap-4 border-b border-border mb-4">
        <a
          href="?tab=asis"
          className={`text-sm pb-2 ${flowType === "business_asis" ? "border-b-2 border-primary text-primary font-medium" : "text-secondary"}`}
        >
          As-Is（現状）
        </a>
        <a
          href="?tab=tobe"
          className={`text-sm pb-2 ${flowType === "business_tobe" ? "border-b-2 border-primary text-primary font-medium" : "text-secondary"}`}
        >
          To-Be（改善後）
        </a>
      </div>

      <form action={addStep} className="grid grid-cols-4 gap-2 mb-5 items-end">
        <input name="role_lane" placeholder="担当者" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="label" placeholder="処理内容" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="system_used" placeholder="使用システム" className="h-9 border border-border rounded-md px-2 text-sm" />
        <button type="submit" className="h-9 bg-primary text-white rounded-md text-sm font-medium">
          + ステップ追加
        </button>
      </form>

      <div className="flex flex-col">
        {steps.map((step, i) => (
          <div key={step.id} className="grid grid-cols-4 items-center py-2 border-t border-[#F1F1EF] text-sm">
            <span className="text-secondary">{i + 1}. {step.role_lane}</span>
            <span>{step.label}</span>
            <span className="text-secondary text-xs">{step.system_used}</span>
            <form action={deleteFlowStep.bind(null, step.id, id, flowType)}>
              <button className="text-xs text-faint justify-self-end">削除</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**注意**：このStepでは並び替え（ドラッグでの順序変更）は実装しない。ステップの順序を変えたい場合は、いったん削除して末尾に追加し直す運用とする（Step3のドラッグ編集で正式対応する）。

## Step 4: 動作確認

1. `/projects/{id}/business-flow?tab=asis` にアクセスし、3〜4ステップ（担当者・処理内容・使用システム）を順に追加する
2. 追加順に番号付きで表示されることを確認
3. `?tab=tobe`に切り替え、As-Isとは独立したステップ一覧を追加できることを確認（As-Isのデータと混ざらないこと）
4. 中間のステップを1件削除し、`flow_edges`が正しく再生成されていることをStudioで確認（削除前後で`from_node`/`to_node`の連鎖が正しく繋がり直っていること）

## やってはいけないこと

- As-IsとTo-Beのステップを同じ`flow_type`で混在させない
- このStepでドラッグ&ドロップや座標（`pos_x`/`pos_y`）の編集機能を作り込まない（Step2・Step3の範囲）
- `regenerateEdges`を呼ばずに`flow_nodes`の追加・削除だけを行う実装にしない（edgeの整合性が崩れる）

## 完了条件

- [ ] `flow_nodes`/`flow_edges`のRLS・GRANT・不足列の確認・追加済み
- [ ] `docs/02_architecture.md` 2.3節を実態に合わせて更新済み
- [ ] As-Is/To-Beそれぞれでステップの追加・削除が動作確認済み
- [ ] `flow_edges`の自動再生成が正しく機能することを確認済み
