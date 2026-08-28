# 指示書：Phase0 Step3 案件・組織・会社の基本管理

## 目的

案件一覧・案件作成・案件詳細（メンバー管理）の3画面を実装する。モックアップの合意内容・デザイントークンはStep1を踏襲する。詳細仕様は `docs/02_architecture.md` 2.1節を参照。

## 前提確認

- Step1（デザイントークン・ログイン画面）、Phase0 Step2（JWTカスタムクレーム）が完了していること
- ログイン状態でJWTに `tenant_id` / `user_role` / `company_id` が含まれることを確認済みであること

---

## Step 1: RLSポリシーを追加（organizations / companies / projects / project_members）

これらのテーブルは既存マイグレーションで `enable row level security` 済みだが、個別ポリシーが未作成のため、現状は全アクセス拒否の状態である。以下を新規マイグレーションとして追加する。

```bash
supabase migration new add_project_management_policies
```

```sql
-- organizations（顧客企業）：認証済みユーザーは閲覧可、作成はadmin/pmのみ
create policy "organizations_select" on organizations
  for select using (auth.uid() is not null);

create policy "organizations_insert" on organizations
  for insert with check ((auth.jwt() ->> 'user_role') in ('admin','pm'));

-- companies（自社/パートナー会社）：認証済みユーザーは閲覧可、作成はadminのみ
create policy "companies_select" on companies
  for select using (auth.uid() is not null);

create policy "companies_insert" on companies
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

-- projects：自分がメンバーの案件、またはadmin/exec/pmoは全件閲覧可
create policy "projects_select" on projects
  for select using (
    id in (select project_id from project_members where user_id = auth.uid())
    or (auth.jwt() ->> 'user_role') in ('admin','exec','pmo')
  );

create policy "projects_insert" on projects
  for insert with check ((auth.jwt() ->> 'user_role') in ('admin','pm'));

-- project_members：自分が参加する案件のメンバー一覧、またはadmin/exec/pmoは全件閲覧可
create policy "project_members_select" on project_members
  for select using (
    project_id in (select project_id from project_members pm2 where pm2.user_id = auth.uid())
    or (auth.jwt() ->> 'user_role') in ('admin','exec','pmo')
  );

create policy "project_members_insert" on project_members
  for insert with check ((auth.jwt() ->> 'user_role') in ('admin','pm'));
```

同じマイグレーションファイルに、案件の対象章選択を保持する列も追加する。

```sql
alter table projects add column if not exists selected_chapters int[] not null default '{}';
```

`supabase db reset` で反映する。

## Step 2: ロールバッジ共通コンポーネントを作成

新規ファイル `src/components/ui/role-badge.tsx`。

```tsx
type Role = "admin" | "exec" | "pmo" | "pm" | "member" | "partner";

const ROLE_MAP: Record<Role, { bg: string; text: string }> = {
  admin:   { bg: "#F1F1EF", text: "#37352F" },
  exec:    { bg: "#F1F1EF", text: "#37352F" },
  pmo:     { bg: "#F1F1EF", text: "#37352F" },
  pm:      { bg: "#F1F1EF", text: "#37352F" },
  member:  { bg: "#F1F1EF", text: "#37352F" },
  partner: { bg: "var(--status-needhearing-bg, #FBE4E4)", text: "var(--status-needhearing-text, #AF3D3D)" },
};

export function RoleBadge({ role }: { role: Role }) {
  const { bg, text } = ROLE_MAP[role];
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-medium w-fit"
      style={{ backgroundColor: bg, color: text }}
    >
      {role}
    </span>
  );
}
```

`partner`ロールのみ視覚的に注意を引く配色（赤系）とし、それ以外はニュートラルな配色にする。

## Step 3: Server Actionsを作成

新規ファイル `src/actions/projects.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function listProjects() {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, selected_chapters, organizations(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listOrganizations() {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase.from("organizations").select("id, name");
  if (error) throw error;
  return data;
}

export async function createProject(formData: FormData) {
  const supabase = await createServerActionClient();

  const name = formData.get("name") as string;
  const organizationId = formData.get("organization_id") as string;
  const selectedChapters = formData.getAll("selected_chapters").map(Number);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // tenant_idはJWTクレームから取得（セッションのapp_metadata経由）
  const { data: sessionData } = await supabase.auth.getSession();
  const tenantId = sessionData.session?.user.app_metadata?.tenant_id
    ?? (sessionData.session as any)?.access_token_claims?.tenant_id;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name,
      organization_id: organizationId,
      selected_chapters: selectedChapters,
      tenant_id: tenantId,
    })
    .select("id")
    .single();

  if (error || !project) {
    redirect(`/projects/new?error=${encodeURIComponent(error?.message ?? "failed")}`);
  }

  // 作成者を自動的にproject_membersへ登録
  await supabase.from("project_members").insert({
    project_id: project.id,
    user_id: userData.user.id,
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function getProjectDetail(projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, selected_chapters, organizations(name)")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return data;
}

export async function listProjectMembers(projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, user_profiles(display_name, user_role, companies(name))")
    .eq("project_id", projectId);
  if (error) throw error;
  return data;
}
```

**注意**：`getSession()`から`tenant_id`を取り出す実装は、Supabase JS SDKのバージョンによりJWTクレームへのアクセス経路が異なる（`session.access_token`をデコードする方が確実な場合がある）。動作しない場合は、`jwt-decode`パッケージ等で`session.access_token`を直接デコードする実装に差し替えること。

## Step 4: 案件一覧画面

新規ファイル `src/app/projects/page.tsx`。

```tsx
import Link from "next/link";
import { listProjects } from "@/actions/projects";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="max-w-4xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-base font-semibold text-primary">案件一覧</h1>
        <Link
          href="/projects/new"
          className="h-8 px-3 bg-primary text-white rounded-md text-sm flex items-center"
        >
          + 新規案件
        </Link>
      </div>

      <div className="flex flex-col">
        {projects?.map((p: any) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="grid grid-cols-4 items-center p-2.5 border-t border-[#F1F1EF] hover:bg-hover text-sm"
          >
            <span className="font-medium text-primary">{p.name}</span>
            <span className="text-secondary">{p.organizations?.name}</span>
            <span>
              <StatusBadge status="ai_draft" />
            </span>
            <span className="text-secondary">Salesforce</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

**注意**：進捗バッジ（`StatusBadge`）は暫定的に`ai_draft`固定表示にしている。実際の章別確定状況を集計するロジック（`requirement_items`を`chapter_no`単位で集計し確定率を出す）はPhase1のテーブルエディタ実装後に追加する。このStepではUIの土台のみを作る。

## Step 5: 案件作成画面

新規ファイル `src/app/projects/new/page.tsx`。

```tsx
import { createProject, listOrganizations } from "@/actions/projects";

const CHAPTERS = [
  { no: 1, label: "お客様概要" }, { no: 2, label: "プロジェクトの目的" },
  { no: 3, label: "ロードマップ" }, { no: 4, label: "KPI" },
  { no: 5, label: "システム要件" }, { no: 6, label: "開発スコープ" },
  { no: 7, label: "ビジネス要件" }, { no: 8, label: "業務要件" },
  { no: 9, label: "機能要件" }, { no: 10, label: "非機能要件" },
  { no: 11, label: "データ移行要件" }, { no: 12, label: "トレーニング要件" },
  { no: 13, label: "システム運用要件" }, { no: 14, label: "システム定着化支援要件" },
  { no: 15, label: "進捗" },
];

export default async function NewProjectPage() {
  const organizations = await listOrganizations();

  return (
    <div className="max-w-md mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">新規案件を作成</h1>

      <form action={createProject} className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-secondary block mb-1">案件名</label>
          <input
            name="name"
            required
            className="w-full h-9 border border-border rounded-md bg-sidebar px-3 text-sm outline-none"
          />
        </div>

        <div>
          <label className="text-xs text-secondary block mb-1">顧客組織</label>
          <select
            name="organization_id"
            required
            className="w-full h-9 border border-border rounded-md bg-sidebar px-3 text-sm"
          >
            {organizations?.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-secondary block mb-1">プラットフォーム知識セット</label>
          <div className="h-9 border border-border rounded-md bg-hover px-3 text-sm flex items-center">
            Salesforce
          </div>
          <p className="text-[11px] text-faint mt-1">現在はSalesforce固定です</p>
        </div>

        <div>
          <label className="text-xs text-secondary block mb-1">対象章</label>
          <div className="flex flex-wrap gap-1.5">
            {CHAPTERS.map((c) => (
              <label
                key={c.no}
                className="text-xs px-2 py-1 rounded bg-hover text-primary flex items-center gap-1"
              >
                <input type="checkbox" name="selected_chapters" value={c.no} defaultChecked />
                {c.no}.{c.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="h-9 bg-primary text-white rounded-md text-sm font-medium mt-2"
        >
          作成する
        </button>
      </form>
    </div>
  );
}
```

## Step 6: 案件詳細（メンバー管理）画面

新規ファイル `src/app/projects/[id]/members/page.tsx`。

```tsx
import { getProjectDetail, listProjectMembers } from "@/actions/projects";
import { RoleBadge } from "@/components/ui/role-badge";

export default async function ProjectMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectDetail(id);
  const members = await listProjectMembers(id);

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <p className="text-[11px] text-faint">{project.organizations?.name}</p>
      <h1 className="text-base font-semibold text-primary mb-4">{project.name}</h1>

      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-faint">{members?.length ?? 0}名</span>
        <button className="h-7 px-3 border border-border rounded-md text-xs">
          メンバーを追加
        </button>
      </div>

      <div className="flex flex-col">
        {members?.map((m: any) => (
          <div key={m.user_id} className="grid grid-cols-3 items-center py-2 border-t border-[#F1F1EF] text-sm">
            <span>{m.user_profiles?.display_name ?? "(未設定)"}</span>
            <span className="text-secondary text-xs">{m.user_profiles?.companies?.name}</span>
            <RoleBadge role={m.user_profiles?.user_role} />
          </div>
        ))}
      </div>

      <div className="mt-3.5 p-2.5 bg-sidebar rounded-md text-[11px] text-faint">
        partnerロールのメンバーは、コスト関連項目・組織横断ダッシュボードを閲覧できません
      </div>
    </div>
  );
}
```

「メンバーを追加」ボタンの実処理（メールアドレスでの検索・追加）は、パートナーアカウント発行フロー（機能要件No.18）と合わせてPhase1の別Stepで実装する。このStepでは表示のみでよい。

## Step 7: 動作確認

1. `npm run dev` → ログイン → `/projects` にアクセスし、一覧が表示される（データが無ければ空表示でよい）
2. `/projects/new` で案件を1件作成し、`/projects/{id}/members` にリダイレクトされることを確認
3. 作成者自身がメンバー一覧に表示されることを確認
4. `user_profiles.user_role` を一時的に`partner`に書き換えたテストユーザーで、`admin`/`pm`以外は`/projects/new`の作成が失敗する（RLSで弾かれる）ことを確認

## やってはいけないこと

- `organizations` / `companies` / `projects` / `project_members` のRLSを緩めて`using (true)`のように全公開にしない
- 案件作成時、作成者を`project_members`に登録する処理を省略しない（登録しないと作成者自身が直後にRLSで弾かれ、自分の案件が見えなくなる）

## 完了条件

- [ ] RLSポリシー追加済み（organizations/companies/projects/project_members）
- [ ] `projects.selected_chapters`列追加済み
- [ ] `role-badge.tsx`作成済み
- [ ] 案件一覧・作成・メンバー管理の3画面が表示・動作確認済み
