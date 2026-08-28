# 指示書：Phase1 Step2 汎用構造化テーブルエディタ（テンプレートA先行実装）

## 目的

汎用構造化テーブルエディタの第一弾として、**テンプレートA（課題解決型：システム要件・ビジネス要件で使用）のみ**を実装する。他4テンプレート（B〜E）は、Aで動作確認が取れてから横展開する。詳細仕様は `docs/01_requirements.md` §9（機能No.4）・`docs/02_architecture.md` 2.2節を参照。

## 前提確認

- Phase1 Step1（資料格納・簡易分類）が完了していること
- `requirement_items` / `chapter_column_templates` テーブルが存在すること（Phase0で作成済みのはずだが、RLS・GRANTが未設定の可能性が高い）

---

## Step 1: requirement_items 系テーブルのRLS・GRANTを総点検

**重要**：これまで3回（Phase0 Step3、Phase1 Step1）発覚しているGRANT漏れは、実は初期の`enable_rls`マイグレーション（`requirement_items`・`change_requests`にポリシーのみ追加しGRANTを含めていなかった回）にも同じ欠陥がある可能性が高い。このStepで着手する前に、必ず以下を確認・修正すること。

```bash
supabase migration new fix_requirement_items_grants
```

```sql
-- CLAUDE.mdのチェックリスト（規約12）に基づき、以下のテーブルに欠けているGRANTを一括で補う
grant select, insert, update, delete on requirement_items to authenticated;
grant select, insert, update, delete on chapter_column_templates to authenticated;
grant select, insert, update, delete on change_requests to authenticated;

-- chapter_column_templatesは全ユーザーが参照できればよい（列定義マスタのため書き込みはadminのみ）
create policy "chapter_column_templates_select" on chapter_column_templates
  for select using (auth.uid() is not null);

create policy "chapter_column_templates_insert" on chapter_column_templates
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');
```

`requirement_items`・`change_requests`の既存ポリシーは`docs/02_architecture.md` 4章のものをそのまま使う（重複作成しない。存在確認してから追加すること）。

`supabase db reset` で反映する。

## Step 2: テンプレートAの列定義をシードデータとして投入

```sql
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('A', 'issue',     '課題・要望',       'text', 1),
  ('A', 'solution',  'ソリューション',   'text', 2),
  ('A', 'kpi',       'KPI',              'text', 3),
  ('A', 'pros_cons', 'メリット・デメリット', 'text', 4)
on conflict (template_type, column_key) do nothing;
```

## Step 3: Server Actionsを作成

新規ファイル `src/actions/requirement-items.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ColumnDef = {
  column_key: string;
  label: string;
  data_type: string;
  order_index: number;
};

export type RequirementItem = {
  id: string;
  chapter_no: number;
  template_type: string;
  content: Record<string, string>;
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved";
};

export async function listColumnDefs(templateType: string): Promise<ColumnDef[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("chapter_column_templates")
    .select("column_key, label, data_type, order_index")
    .eq("template_type", templateType)
    .order("order_index");
  if (error) throw error;
  return data;
}

export async function listRequirementItems(
  projectId: string,
  chapterNo: number
): Promise<RequirementItem[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, template_type, content, status")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .order("order_index");
  if (error) throw error;
  return data;
}

export async function createRequirementItem(
  projectId: string,
  tenantId: string,
  chapterNo: number,
  templateType: string
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").insert({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: chapterNo,
    template_type: templateType,
    content: {},
    status: "se_reviewing", // 手動追加した行はSE入力扱いとする
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function updateRequirementItemContent(
  itemId: string,
  projectId: string,
  chapterNo: number,
  content: Record<string, string>
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function updateRequirementItemStatus(
  itemId: string,
  projectId: string,
  chapterNo: number,
  status: RequirementItem["status"]
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

**注意**：`createRequirementItem`は`tenant_id`を引数で受け取る簡易実装にしている。Phase0 Step3の`createProject`と同様、セッションからの`tenant_id`取得方法がSDKバージョンに依存するため、呼び出し元（Step5のページ）でセッションから取得して渡す形にする。

## Step 4: テーブルエディタコンポーネントを作成

新規ファイル `src/components/domain/requirement-table/RequirementTable.tsx`。

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  updateRequirementItemContent,
  updateRequirementItemStatus,
  type ColumnDef,
  type RequirementItem,
} from "@/actions/requirement-items";
import { StatusBadge } from "@/components/ui/status-badge";

export function RequirementTable({
  projectId,
  chapterNo,
  columns,
  items,
}: {
  projectId: string;
  chapterNo: number;
  columns: ColumnDef[];
  items: RequirementItem[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleContentChange(item: RequirementItem, key: string, value: string) {
    const nextContent = { ...item.content, [key]: value };
    startTransition(() => {
      updateRequirementItemContent(item.id, projectId, chapterNo, nextContent);
    });
  }

  function handleConfirm(item: RequirementItem) {
    startTransition(() => {
      updateRequirementItemStatus(item.id, projectId, chapterNo, "confirmed");
    });
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="grid bg-sidebar text-xs text-secondary"
        style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) 100px 80px` }}
      >
        {columns.map((c) => (
          <div key={c.column_key} className="px-3 py-2">{c.label}</div>
        ))}
        <div className="px-3 py-2">ステータス</div>
        <div className="px-3 py-2"></div>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          className="grid border-t border-[#F1F1EF]"
          style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) 100px 80px` }}
        >
          {columns.map((c) => (
            <input
              key={c.column_key}
              defaultValue={item.content[c.column_key] ?? ""}
              onBlur={(e) => handleContentChange(item, c.column_key, e.target.value)}
              className="px-3 py-2 text-sm outline-none focus:bg-hover"
              disabled={item.status === "confirmed"}
            />
          ))}
          <div className="px-3 py-2 flex items-center">
            <StatusBadge status={item.status === "exception_approved" ? "confirmed" : item.status} />
          </div>
          <div className="px-3 py-2 flex items-center">
            {item.status !== "confirmed" && (
              <button
                disabled={isPending}
                onClick={() => handleConfirm(item)}
                className="text-xs text-secondary underline"
              >
                確定
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**注意**：`confirmed`後の項目は`input`を`disabled`にし、上書きできないようにしている（`docs/02_architecture.md` 5.1節「確定済み項目を上書きしない」方針に対応）。ただし本Stepでは「確定を取り消す」導線は未実装（Phase3の例外承認・ベースライン管理と合わせて検討）。

## Step 5: 章別ページを作成

新規ファイル `src/app/projects/[id]/chapters/[chapterNo]/page.tsx`。

```tsx
import {
  listColumnDefs,
  listRequirementItems,
  createRequirementItem,
} from "@/actions/requirement-items";
import { RequirementTable } from "@/components/domain/requirement-table/RequirementTable";
import { createServerActionClient } from "@/lib/supabase/server";

// このStepではテンプレートAのみ対応。章番号→テンプレート種別の対応表は
// 本来chapter_column_templatesとは別にマスタ化すべきだが、Phase1後半で整理する前提の暫定実装
const CHAPTER_TEMPLATE_MAP: Record<number, string> = {
  5: "A",
  7: "A",
};

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterNo: string }>;
}) {
  const { id, chapterNo } = await params;
  const chapterNum = Number(chapterNo);
  const templateType = CHAPTER_TEMPLATE_MAP[chapterNum];

  if (!templateType) {
    return <div className="p-6 text-sm text-secondary">この章はまだ対応していません（テンプレートA以外は未実装）。</div>;
  }

  const [columns, items] = await Promise.all([
    listColumnDefs(templateType),
    listRequirementItems(id, chapterNum),
  ]);

  const supabase = await createServerActionClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const tenantId = (sessionData.session as any)?.access_token_claims?.tenant_id;
  const addItem = createRequirementItem.bind(null, id, tenantId, chapterNum, templateType);

  return (
    <div className="max-w-4xl mx-auto mt-10">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-base font-semibold text-primary">
          {chapterNum}. {chapterNum === 5 ? "システム要件" : "ビジネス要件"}
        </h1>
        <form action={addItem}>
          <button className="h-8 px-3 border border-border rounded-md text-sm">+ 行を追加</button>
        </form>
      </div>
      <RequirementTable projectId={id} chapterNo={chapterNum} columns={columns} items={items} />
    </div>
  );
}
```

**注意**：`tenant_id`の取得部分は`any`を使っているが、これは既存の`createProject`実装（Phase0 Step3）と同じ暫定対応。もしPhase0 Step3で`tenant_id`取得の実装を型安全な形に修正済みであれば、そちらの実装（関数化されているはず）を再利用し、ここでコードを重複させないこと。

## Step 6: 動作確認

1. `/projects/{id}/chapters/5` にアクセス
2. 「+ 行を追加」で1行作成 → 4列（課題・要望／ソリューション／KPI／メリット・デメリット）が編集可能なテキスト入力として表示される
3. 各セルに入力→フォーカスを外す(`onBlur`)→リロードしても値が保持されていることを確認
4. 「確定」ボタンを押す→ステータスバッジが「確定」に変わり、以降そのセルが編集不可になることを確認
5. `/projects/{id}/chapters/7` でも同様に動作することを確認（同じテンプレートAを使い回せていることの確認）

## やってはいけないこと

- `confirmed`状態の項目のcontentをUIから直接上書きできる状態にしない
- テンプレートB〜E用のコードをこのStepで先回りして実装しない（段階的に進める方針のため、Aの動作確認が先）
- 章番号とテンプレート種別の対応表（`CHAPTER_TEMPLATE_MAP`）を本番の正式なマスタ管理方法と誤解しない（暫定実装である旨をコードコメントに残す）

## 完了条件

- [ ] `requirement_items`・`chapter_column_templates`・`change_requests`のGRANT総点検・修正済み
- [ ] テンプレートAの列定義をシード済み
- [ ] 5章・7章それぞれでテーブルの表示・編集・確定が動作確認済み
