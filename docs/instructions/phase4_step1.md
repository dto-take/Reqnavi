# 指示書：Phase4 Step1 案件横断連携（同一顧客内の他案件参照）

## 目的

同一顧客（`organizations`）配下の他案件のうち、双方が`allow_cross_project_reference`を有効にしている場合に限り、確定済み項目を参考情報として参照・取り込みできるようにする。詳細は `docs/01_requirements.md` §9（機能No.13）・`docs/02_architecture.md` 7章（マルチテナント設計・Phase4移行パス）を参照。

## 運用ルールの確定（TD-003への対応）

これまで「誰がいつオンにするか」が未確定だったが、以下のルールとする。

- **PM/管理者が、案件設定画面で個別にON/OFFを切り替える**（デフォルトはOFF）
- 参照が成立するのは、**参照する側・参照される側の双方**が有効にしている場合のみ（片方だけでは成立しない）
- 参照可能なのは**確定済み（`confirmed`/`exception_approved`）項目のみ**。`ai_draft`/`se_reviewing`の項目は他案件から見えない

## 前提確認

- 1〜3章の実装、章名一覧の一元化が完了していること

---

## Step 1: 案件横断参照のRLSを整備

```bash
supabase migration new add_cross_project_reference
```

```sql
-- 案件横断で確定済み項目を参照可能かを判定するヘルパー関数（自己参照ではないため通常のsql関数でよいが、
-- 複数テーブルをまたぐ判定のためsecurity definerとする）
create or replace function can_view_cross_project_item(item_project_id uuid, item_status text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from projects p_item
    join projects p_viewer on p_viewer.organization_id = p_item.organization_id
    join project_members pm on pm.project_id = p_viewer.id and pm.user_id = auth.uid()
    where p_item.id = item_project_id
      and p_item.allow_cross_project_reference = true
      and p_viewer.allow_cross_project_reference = true
      and item_status in ('confirmed', 'exception_approved')
  );
$$;

-- 既存のreqnavi_access（自案件のみ）に加えて、案件横断参照用のポリシーを追加する
-- （複数の permissive ポリシーはORで結合されるため、既存ポリシーは変更しない）
create policy "requirement_items_cross_project_select" on requirement_items
  for select using (
    can_view_cross_project_item(project_id, status)
  );

-- projectsテーブルのallow_cross_project_referenceは、PM/管理者のみ変更可能にする
create policy "projects_update_cross_reference" on projects
  for update using (
    is_project_member(id)
    and (auth.jwt() ->> 'user_role') in ('admin','pm')
  );
```

`supabase db reset` で反映する。**注意**：`projects`テーブルにUPDATEポリシーが既に存在する場合は重複作成しないこと（規約16に従い、既存ポリシーの有無を先に確認する）。

## Step 2: 案件設定画面を作成

新規ファイル `src/actions/project-settings.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleCrossProjectReference(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const enabled = formData.get("enabled") === "true";

  const { error } = await supabase
    .from("projects")
    .update({ allow_cross_project_reference: enabled })
    .eq("id", projectId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/settings`);
}
```

新規ファイル `src/app/projects/[id]/settings/page.tsx`。

```tsx
import { createServerActionClient } from "@/lib/supabase/server";
import { toggleCrossProjectReference } from "@/actions/project-settings";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const canEdit = ["admin", "pm"].includes(claims?.claims?.user_role as string);

  const { data: project } = await supabase
    .from("projects")
    .select("allow_cross_project_reference")
    .eq("id", id)
    .single();

  return (
    <div className="max-w-md mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">案件設定</h1>

      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm text-primary">同一顧客内の他案件参照</div>
          <p className="text-xs text-secondary mt-0.5">
            有効にすると、同じ顧客組織の他案件（同様に有効化している場合のみ）の確定済み項目を参照できます
          </p>
        </div>
      </div>

      {canEdit ? (
        <form action={toggleCrossProjectReference.bind(null, id)}>
          <input type="hidden" name="enabled" value={project?.allow_cross_project_reference ? "false" : "true"} />
          <button className="h-8 px-3 border border-border rounded-md text-sm">
            {project?.allow_cross_project_reference ? "無効にする" : "有効にする"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-faint">変更にはPM以上の権限が必要です</p>
      )}
    </div>
  );
}
```

## Step 3: 他案件参照ビューを作成

新規ファイル `src/actions/cross-project-reference.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function listCrossProjectReferences(currentProjectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  // RLS（can_view_cross_project_item）が、自案件以外の確定済み項目のみを絞り込んで返す
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, project_id, content, template_type, projects(name)")
    .neq("project_id", currentProjectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;
  return data;
}

export async function copyReferenceItem(
  currentProjectId: string,
  chapterNo: number,
  templateType: string,
  content: Record<string, string>
) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { error } = await supabase.from("requirement_items").insert({
    project_id: currentProjectId,
    tenant_id: tenantId,
    chapter_no: chapterNo,
    template_type: templateType,
    content,
    status: "ai_draft",
  });
  if (error) throw error;
  revalidatePath(`/projects/${currentProjectId}/chapters/${chapterNo}`);
}
```

新規ファイル `src/app/projects/[id]/chapters/[chapterNo]/cross-reference/page.tsx`。

```tsx
import { listCrossProjectReferences, copyReferenceItem } from "@/actions/cross-project-reference";
import { CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";

export default async function CrossReferencePage({
  params,
}: {
  params: Promise<{ id: string; chapterNo: string }>;
}) {
  const { id, chapterNo } = await params;
  const chapterNum = Number(chapterNo);
  const templateType = CHAPTER_TEMPLATE_MAP[chapterNum];
  const references = await listCrossProjectReferences(id, chapterNum);

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-1">他案件からの参照</h1>
      <p className="text-xs text-secondary mb-4">
        同一顧客内の他案件（双方で参照を有効化している場合のみ）の確定済み項目（{references.length}件）
      </p>

      {references.length === 0 ? (
        <p className="text-sm text-secondary">参照可能な項目はありません（案件設定で参照を有効化しているかご確認ください）</p>
      ) : (
        <div className="flex flex-col gap-2">
          {references.map((r) => (
            <div key={r.id} className="border border-border rounded-md p-3">
              <div className="text-xs text-faint mb-1">{(r.projects as unknown as { name: string })?.name}</div>
              <div className="text-sm mb-2">{JSON.stringify(r.content)}</div>
              <form action={copyReferenceItem.bind(null, id, chapterNum, templateType, r.content)}>
                <button className="text-xs text-secondary underline">この案件に取り込む（AI素案として）</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

`chapters/[chapterNo]/page.tsx`に、この画面への導線を追加する。

```tsx
<a href={`/projects/${id}/chapters/${chapterNum}/cross-reference`} className="text-xs text-secondary underline">
  他案件から参照
</a>
```

## Step 4: 動作確認

1. 同一顧客組織（`organizations`）に2つの案件を作成する
2. 案件Aで`/projects/{A}/settings`から参照を有効化、いずれかの章の項目を確定させる
3. 案件Bでは参照を無効のままにし、`/projects/{B}/chapters/{同じ章}/cross-reference`にアクセス→案件Aの項目が**見えないこと**を確認（片方だけ有効では成立しない）
4. 案件Bでも参照を有効化し、再度アクセス→案件Aの確定済み項目が表示されることを確認
5. 「この案件に取り込む」を実行し、案件Bに`ai_draft`ステータスの新しい項目が作成されることを確認
6. 別の顧客組織の案件を作成し、双方で参照を有効化していても、**組織が異なる場合は参照できないこと**を確認

## やってはいけないこと

- 取り込んだ項目を`ai_draft`以外のステータスで作成しない（他案件の内容であっても、SEの確認前に確定扱いにしない）
- `ai_draft`/`se_reviewing`状態の項目を他案件から参照できる状態にしない（確定済みのみ）

## 完了条件

- [ ] RLS（`can_view_cross_project_item`、cross_project_selectポリシー）実装済み
- [ ] 案件設定画面（ON/OFF切替）実装済み
- [ ] 他案件参照ビュー・取り込み機能実装済み
- [ ] 双方有効化・組織一致の条件が正しく機能することを確認済み
