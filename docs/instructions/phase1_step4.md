# 指示書：Phase1 Step4 階層ツリー型（D・KPI）・チェックリスト型（E・非機能要件）

## 目的

4章（KPI）用の階層ツリーエディタと、10章（非機能要件）用のチェックリストエディタを実装する。いずれも`RequirementTable`（テンプレートA/B/C用）とは別コンポーネントとする。**`chapter_column_templates`はテンプレートD/Eでは使用しない**（列ではなくJSON構造そのもので表現するため）。詳細は `docs/01_requirements.md` §9・§4、`docs/02_architecture.md` 2.2節を参照。

## 前提確認

- Phase1 Step3（テンプレートB・C横展開）が完了していること

---

## Step 1: KPIツリー（テンプレートD）のServer Actionsを作成

新規ファイル `src/actions/kpi-tree.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const KPI_LEVELS = ["ゴール", "目標", "戦略", "戦術"] as const;
export type KpiLevel = (typeof KPI_LEVELS)[number];

export type KpiNode = {
  id: string;
  parent_id: string | null;
  content: { level: KpiLevel; text: string };
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved";
};

export async function listKpiTree(projectId: string): Promise<KpiNode[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, parent_id, content, status")
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .eq("template_type", "D")
    .order("order_index");
  if (error) throw error;
  return data;
}

export async function createKpiNode(
  projectId: string,
  tenantId: string,
  parentId: string | null,
  level: KpiLevel
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").insert({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 4,
    template_type: "D",
    parent_id: parentId,
    content: { level, text: "" },
    status: "se_reviewing",
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}

export async function updateKpiNodeText(nodeId: string, projectId: string, text: string) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("id", nodeId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("requirement_items")
    .update({ content: { ...current.content, text } })
    .eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}

export async function deleteKpiNode(nodeId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").delete().eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}
```

**注意**：`requirement_items`の既存RLS（`reqnavi_access`/`reqnavi_insert`/`reqnavi_update`）に加えて、**DELETE用ポリシーが存在しない**（Phase1 Step2までSELECT/INSERT/UPDATEのみ対応していた）。`deleteKpiNode`を動かす前に、以下を新規マイグレーションで追加すること。

```sql
create policy "reqnavi_delete" on requirement_items
  for delete using (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );
```

追加したら`docs/02_architecture.md` 4章にもこのポリシーを追記すること（CLAUDE.md規約16の通り、操作ごとの網羅確認を徹底する）。

## Step 2: KPIツリーコンポーネントを作成

新規ファイル `src/components/domain/kpi-tree/KpiTree.tsx`。

```tsx
"use client";

import { useTransition } from "react";
import {
  createKpiNode,
  updateKpiNodeText,
  deleteKpiNode,
  KPI_LEVELS,
  type KpiNode,
  type KpiLevel,
} from "@/actions/kpi-tree";

function buildTree(nodes: KpiNode[], parentId: string | null): KpiNode[] {
  return nodes.filter((n) => n.parent_id === parentId);
}

function nextLevel(level: KpiLevel): KpiLevel | null {
  const idx = KPI_LEVELS.indexOf(level);
  return idx < KPI_LEVELS.length - 1 ? KPI_LEVELS[idx + 1] : null;
}

export function KpiTree({ projectId, nodes }: { projectId: string; nodes: KpiNode[] }) {
  const [isPending, startTransition] = useTransition();

  function renderNode(node: KpiNode, depth: number) {
    const children = buildTree(nodes, node.id);
    const childLevel = nextLevel(node.content.level);

    return (
      <div key={node.id} style={{ marginLeft: depth * 20 }} className="mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint w-10">{node.content.level}</span>
          <input
            defaultValue={node.content.text}
            onBlur={(e) => startTransition(() => updateKpiNodeText(node.id, projectId, e.target.value))}
            className="flex-1 border border-border rounded-md px-2 py-1 text-sm"
          />
          {childLevel && (
            <button
              disabled={isPending}
              onClick={() => startTransition(() => createKpiNode(projectId, node.parent_id ?? "", node.id, childLevel))}
              className="text-xs text-secondary underline"
            >
              + {childLevel}を追加
            </button>
          )}
          <button
            disabled={isPending}
            onClick={() => startTransition(() => deleteKpiNode(node.id, projectId))}
            className="text-xs text-faint"
          >
            削除
          </button>
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  const roots = buildTree(nodes, null);

  return (
    <div className="border border-border rounded-lg p-4">
      {roots.map((r) => renderNode(r, 0))}
      {roots.length === 0 && (
        <button
          onClick={() => startTransition(() => createKpiNode(projectId, "", null, "ゴール"))}
          className="text-sm text-secondary underline"
        >
          + ゴールを追加
        </button>
      )}
    </div>
  );
}
```

**注意**：`createKpiNode`の第2引数（`tenantId`）をここでは空文字で仮置きしている。Phase0 Step3・Phase1 Step2と同様、呼び出し元のページでセッションから取得した`tenantId`を渡す実装に修正すること（このコンポーネント単体でtenant_idを解決する手段がないため）。

## Step 3: 非機能要件チェックリスト（テンプレートE）のServer Actionsを作成

新規ファイル `src/actions/nonfunctional-checklist.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ChecklistItem = { item: string; status: "済" | "未" | "対象外" };
export type ChecklistContent = { category: string; overview: string; checklist: ChecklistItem[] };

export type ChecklistCategoryRow = {
  id: string;
  content: ChecklistContent;
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved";
};

export async function listChecklistCategories(projectId: string): Promise<ChecklistCategoryRow[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, content, status")
    .eq("project_id", projectId)
    .eq("chapter_no", 10)
    .eq("template_type", "E")
    .order("order_index");
  if (error) throw error;
  return data;
}

export async function createChecklistCategory(projectId: string, tenantId: string, category: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").insert({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 10,
    template_type: "E",
    content: { category, overview: "", checklist: [] } satisfies ChecklistContent,
    status: "se_reviewing",
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/10`);
}

export async function updateChecklistContent(
  itemId: string,
  projectId: string,
  content: ChecklistContent
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ content })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/10`);
}
```

## Step 4: チェックリストコンポーネントを作成

新規ファイル `src/components/domain/nonfunctional-checklist/ChecklistCard.tsx`。

```tsx
"use client";

import { useTransition } from "react";
import {
  updateChecklistContent,
  type ChecklistCategoryRow,
  type ChecklistItem,
} from "@/actions/nonfunctional-checklist";

const STATUS_CYCLE: ChecklistItem["status"][] = ["未", "済", "対象外"];

export function ChecklistCard({ projectId, row }: { projectId: string; row: ChecklistCategoryRow }) {
  const [isPending, startTransition] = useTransition();
  const { content } = row;

  function save(next: typeof content) {
    startTransition(() => updateChecklistContent(row.id, projectId, next));
  }

  function cycleStatus(index: number) {
    const items = [...content.checklist];
    const current = items[index].status;
    const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
    items[index] = { ...items[index], status: STATUS_CYCLE[nextIdx] };
    save({ ...content, checklist: items });
  }

  function addItem() {
    save({ ...content, checklist: [...content.checklist, { item: "", status: "未" }] });
  }

  function removeItem(index: number) {
    save({ ...content, checklist: content.checklist.filter((_, i) => i !== index) });
  }

  return (
    <div className="border border-border rounded-lg p-4 mb-3">
      <div className="text-sm font-semibold text-primary mb-2">{content.category}</div>
      <textarea
        defaultValue={content.overview}
        onBlur={(e) => save({ ...content, overview: e.target.value })}
        placeholder="概要"
        className="w-full border border-border rounded-md px-2 py-1.5 text-sm mb-2"
        rows={2}
      />
      {content.checklist.map((c, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <input
            defaultValue={c.item}
            onBlur={(e) => {
              const items = [...content.checklist];
              items[i] = { ...items[i], item: e.target.value };
              save({ ...content, checklist: items });
            }}
            className="flex-1 border border-border rounded-md px-2 py-1 text-sm"
            placeholder="チェック項目"
          />
          <button
            disabled={isPending}
            onClick={() => cycleStatus(i)}
            className="text-xs px-2 py-0.5 rounded bg-hover text-secondary w-14"
          >
            {c.status}
          </button>
          <button disabled={isPending} onClick={() => removeItem(i)} className="text-xs text-faint">
            削除
          </button>
        </div>
      ))}
      <button onClick={addItem} className="text-xs text-secondary underline mt-1">
        + 項目を追加
      </button>
    </div>
  );
}
```

## Step 5: 4章・10章のページを作成

新規ファイル `src/app/projects/[id]/chapters/4/page.tsx`（KPI専用ページ。動的`[chapterNo]`ルートとは別に固定パスとして作る）。

```tsx
import { listKpiTree } from "@/actions/kpi-tree";
import { KpiTree } from "@/components/domain/kpi-tree/KpiTree";

export default async function KpiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodes = await listKpiTree(id);

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <h1 className="text-base font-semibold text-primary mb-3">4. KPI</h1>
      <KpiTree projectId={id} nodes={nodes} />
    </div>
  );
}
```

新規ファイル `src/app/projects/[id]/chapters/10/page.tsx`。

```tsx
import { listChecklistCategories, createChecklistCategory } from "@/actions/nonfunctional-checklist";
import { ChecklistCard } from "@/components/domain/nonfunctional-checklist/ChecklistCard";
import { createServerActionClient } from "@/lib/supabase/server";

const DEFAULT_CATEGORIES = ["可用性", "性能拡張性", "運用保守性", "移植性", "セキュリティ"];

export default async function NonFunctionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await listChecklistCategories(id);

  const supabase = await createServerActionClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const tenantId = (sessionData.session as any)?.access_token_claims?.tenant_id;

  const existingCategories = rows.map((r) => r.content.category);
  const missingCategories = DEFAULT_CATEGORIES.filter((c) => !existingCategories.includes(c));

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <h1 className="text-base font-semibold text-primary mb-3">10. 非機能要件</h1>

      {rows.map((row) => (
        <ChecklistCard key={row.id} projectId={id} row={row} />
      ))}

      {missingCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {missingCategories.map((cat) => (
            <form key={cat} action={createChecklistCategory.bind(null, id, tenantId, cat)}>
              <button className="text-xs px-2 py-1 border border-border rounded-md text-secondary">
                + {cat}を追加
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
```

**注意**：`[chapterNo]`の動的ルートと`4`・`10`の固定ルートが両方存在すると、Next.jsのルーティング上競合する可能性がある（`[chapterNo]`が`4`や`10`にもマッチしてしまうため）。`[chapterNo]/page.tsx`側で`chapterNum`が4または10の場合は「KPI/非機能要件はこちらで対応：/projects/{id}/chapters/4」のように専用ルートへリダイレクトする分岐を追加するか、`CHAPTER_TEMPLATE_MAP`から4・10を除外して404扱いにする実装に調整すること。どちらが良いか判断に迷う場合はユーザーに確認すること。

## Step 6: 動作確認

1. `/projects/{id}/chapters/4` で「ゴール」→「目標」→「戦略」→「戦術」の4階層をこの順に追加し、インデントされて表示されることを確認
2. 戦術ノードには「+ 追加」ボタンが出ない（4階層で打ち止め）ことを確認
3. `/projects/{id}/chapters/10` で「可用性」等のカテゴリを追加し、チェック項目の追加・ステータス切替（未→済→対象外→未…）・削除が動作することを確認

## やってはいけないこと

- `RequirementTable`（テンプレートA/B/C用）にD/Eの分岐を追加しない
- KPIツリーの階層を4階層より深く作れる導線を残さない
- `requirement_items`のDELETEポリシーを追加する際、既存のSELECT/INSERT/UPDATEポリシーと可視条件をずらさない（同一条件で揃える）

## 完了条件

- [ ] `reqnavi_delete`ポリシー追加済み、`02_architecture.md`に追記済み
- [ ] KPIツリー（4章）が4階層固定で動作確認済み
- [ ] 非機能要件チェックリスト（10章）が動作確認済み
- [ ] `[chapterNo]`動的ルートと4章・10章固定ルートの競合が解消されていることを確認済み
