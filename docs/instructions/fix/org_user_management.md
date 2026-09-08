# 指示書：顧客管理・ユーザ管理・案件一覧の拡張

## 目的

1. トップメニューに「顧客管理」「ユーザ管理」を追加する
2. 案件一覧に絞り込み機能と、カード型/一覧型の表示切替を追加する

## 前提確認

- 深緑系配色への切り替えが完了していること
- `organizations`のRLSは`organizations_select`（全認証済みユーザー閲覧可）・`organizations_insert`（admin/pmのみ）が既に存在するが、UPDATE用ポリシーが無い（CLAUDE.md規約16）。本Stepで追加する

---

## Step 1: organizationsのUPDATEポリシーを整備

```bash
supabase migration new add_organizations_update_policy
```

```sql
create policy "organizations_update" on organizations
  for update using ((auth.jwt() ->> 'user_role') in ('admin', 'pm'));
```

`supabase db reset` で反映する。

## Step 2: 顧客管理画面を作成

新規ファイル `src/actions/organizations.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function listOrganizationsWithProjectCount() {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, industry, projects(id)")
    .order("name");
  if (error) throw error;
  return data;
}

export async function createOrganization(formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new Error("PM以上の権限が必要です");
  }

  const { error } = await supabase.from("organizations").insert({
    name: formData.get("name") as string,
    industry: formData.get("industry") as string,
  });
  if (error) throw error;
  revalidatePath("/organizations");
}

export async function updateOrganization(orgId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: formData.get("name") as string, industry: formData.get("industry") as string })
    .eq("id", orgId);
  if (error) throw error;
  revalidatePath("/organizations");
}
```

新規ファイル `src/app/organizations/page.tsx`。

```tsx
import { listOrganizationsWithProjectCount, createOrganization } from "@/actions/organizations";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function OrganizationsPage() {
  const organizations = await listOrganizationsWithProjectCount();

  return (
    <div className="max-w-3xl mx-auto mt-10 flex flex-col gap-6">
      <Card>
        <PageHeader title="顧客管理" />
        <div className="flex flex-col gap-1">
          {organizations.map((org: any) => (
            <div key={org.id} className="flex justify-between items-center py-2 border-t border-hover text-sm">
              <span className="font-medium text-primary">{org.name}</span>
              <span className="text-xs text-secondary">{org.industry}</span>
              <span className="text-xs text-faint">{org.projects?.length ?? 0}件の案件</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-primary mb-3">新規顧客を追加</h2>
        <form action={createOrganization} className="flex gap-2">
          <div className="flex-1">
            <Label>顧客名</Label>
            <Input name="name" required className="w-full" />
          </div>
          <div className="flex-1">
            <Label>業種（任意）</Label>
            <Input name="industry" className="w-full" />
          </div>
          <SubmitButton pendingText="追加中...">追加</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
```

**注意**：編集（更新）機能は`updateOrganization`のみ用意し、画面上のUIは今回シンプルに新規追加のみとする（一覧の各行をクリックして編集する画面は、必要になった時点で追加する）。

## Step 3: ユーザ管理画面を作成

新規ファイル `src/actions/user-management.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createServerActionClient>>) {
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") throw new Error("管理者のみ実行できます");
}

export async function listAllUsers() {
  const supabase = await createServerActionClient();
  await assertAdmin(supabase);

  const admin = createAdminClient();
  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers();
  if (authError) throw authError;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, user_role, auth_provider, force_password_reset, companies(name)");
  if (profileError) throw profileError;

  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

  return authUsers.users.map((u) => ({
    id: u.id,
    email: u.email,
    profile: profileMap.get(u.id) ?? null,
  }));
}

export async function updateUserRole(userId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  await assertAdmin(supabase);

  const newRole = formData.get("user_role") as string;
  const { error } = await supabase
    .from("user_profiles")
    .update({ user_role: newRole })
    .eq("user_id", userId);
  if (error) throw error;
  revalidatePath("/admin/users");
}
```

新規ファイル `src/app/admin/users/page.tsx`。

```tsx
import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listAllUsers, updateUserRole } from "@/actions/user-management";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

const ROLES = ["admin", "exec", "pmo", "pm", "member", "partner"];

export default async function AdminUsersPage() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") redirect("/projects");

  const users = await listAllUsers();

  return (
    <Card className="max-w-3xl mx-auto mt-10">
      <PageHeader title="ユーザ管理" />
      <div className="flex flex-col gap-1">
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-4 items-center py-2 border-t border-hover text-sm">
            <span className="text-primary">{u.email}</span>
            <span className="text-xs text-secondary">{(u.profile?.companies as unknown as { name: string })?.name ?? "-"}</span>
            <span className="text-xs text-faint">{u.profile?.auth_provider ?? "-"}</span>
            <form action={updateUserRole.bind(null, u.id)} className="flex gap-1 items-center">
              <Select name="user_role" defaultValue={u.profile?.user_role ?? "member"}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <SubmitButton size="sm" pendingText="...">変更</SubmitButton>
            </form>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

**注意**：`src/components/ui/input.tsx`に`Select`は既に定義済みのはず（共通コンポーネント化のStepで作成済み）。無ければ追加すること。

## Step 4: トップメニューに導線を追加

`src/app/projects/layout.tsx`（共通ヘッダー）に、admin権限のユーザーにのみ表示するメニューを追加する。

```tsx
{userRole === "admin" && (
  <nav className="flex gap-4">
    <Link href="/organizations" className="text-sm text-secondary hover:text-primary">顧客管理</Link>
    <Link href="/admin/users" className="text-sm text-secondary hover:text-primary">ユーザ管理</Link>
  </nav>
)}
```

`userRole`をこのレイアウト内で既に取得していない場合は、`supabase.auth.getClaims()`から取得して追加すること。

## Step 5: 案件一覧に絞り込み・表示切替を追加

`src/actions/projects.ts`の`listProjects`を、顧客での絞り込みに対応させる。

```ts
export async function listProjects(organizationId?: string) {
  const supabase = await createServerActionClient();
  let query = supabase
    .from("projects")
    .select("id, name, selected_chapters, organizations(id, name)")
    .order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

`src/app/projects/page.tsx`を、`searchParams`でクエリパラメータ（`?org=`絞り込み、`?view=card|list`表示切替）を受け取る形に修正する。

```tsx
import { listProjects } from "@/actions/projects";
import { listOrganizationsWithProjectCount } from "@/actions/organizations";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; view?: string }>;
}) {
  const { org, view } = await searchParams;
  const viewMode = view === "list" ? "list" : "card";

  const [projects, organizations] = await Promise.all([
    listProjects(org),
    listOrganizationsWithProjectCount(),
  ]);

  return (
    <div className="max-w-5xl mx-auto mt-10">
      <PageHeader
        title="案件一覧"
        action={<Link href="/projects/new"><Button variant="primary" size="sm">+ 新規案件</Button></Link>}
      />

      <div className="flex justify-between items-center mb-4">
        <form className="flex gap-2">
          <select name="org" defaultValue={org ?? ""} className="h-8 border border-border rounded-md px-2 text-xs">
            <option value="">すべての顧客</option>
            {organizations.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <input type="hidden" name="view" value={viewMode} />
          <button className="h-8 px-3 border border-border rounded-md text-xs">絞り込む</button>
        </form>

        <div className="flex gap-1">
          <Link href={`/projects?org=${org ?? ""}&view=card`} className={`text-xs px-2 py-1 rounded ${viewMode === "card" ? "bg-hover text-primary" : "text-secondary"}`}>カード</Link>
          <Link href={`/projects?org=${org ?? ""}&view=list`} className={`text-xs px-2 py-1 rounded ${viewMode === "list" ? "bg-hover text-primary" : "text-secondary"}`}>一覧</Link>
        </div>
      </div>

      {viewMode === "card" ? (
        <div className="grid grid-cols-3 gap-3">
          {/* 既存のカード表示（見栄え向上Stepで実装済みのもの）をそのままここに配置 */}
        </div>
      ) : (
        <Card>
          <div className="flex flex-col">
            {projects?.map((p: any) => (
              <Link key={p.id} href={`/projects/${p.id}/members`} className="grid grid-cols-3 items-center p-2 border-t border-hover hover:bg-hover text-sm">
                <span className="font-medium text-primary">{p.name}</span>
                <span className="text-secondary">{p.organizations?.name}</span>
                <span className="text-xs text-faint">{(p.selected_chapters as number[])?.length ?? 0}章</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
```

**注意**：カード表示部分は、見栄え向上Stepで既に実装済みのカードUI（確定率バー・プラットフォームタグ等）をそのまま移設すること（本指示書では省略している）。一覧型は簡易な行表示のみとする。

## Step 6: 動作確認

1. admin権限でログインし、ヘッダーに「顧客管理」「ユーザ管理」が表示されることを確認する
2. `/organizations` で顧客を1件追加し、一覧に表示されることを確認する
3. `/admin/users` でユーザーのロールを変更し、`user_profiles.user_role`が更新されることを確認する（自分自身のロールをうっかり`member`に変更しないよう注意する）
4. pm/member権限でログインした場合、ヘッダーに「顧客管理」「ユーザ管理」が表示されないことを確認する
5. `/projects?org={id}` で、指定した顧客の案件のみが表示されることを確認する
6. カード表示⇔一覧表示の切り替えが正しく機能することを確認する

## やってはいけないこと

- 顧客管理・ユーザ管理画面をadmin以外に表示・実行可能な状態にしない
- ユーザ管理でロールを変更する際、変更後のバリデーション（存在しないロール文字列が入らないようにする等）を省略しない

## 完了条件

- [ ] 顧客管理画面（一覧・追加）実装済み
- [ ] ユーザ管理画面（一覧・ロール変更）実装済み
- [ ] トップメニューへの導線（admin限定）追加済み
- [ ] 案件一覧の絞り込み・表示切替が動作確認済み
