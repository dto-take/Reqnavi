# 指示書：認証・メンバー管理の作り忘れ解消

## 目的

以下3点を実装する。

1. 自社メンバー（Google SSO）初回ログイン時の`user_profiles`自動作成
2. パートナーアカウント発行（機能要件No.18）＋初回ログイン時のパスワード変更強制
3. 案件へのメンバー追加（メールアドレス検索→`project_members`登録）の実処理

詳細は `docs/02_architecture.md` 3章（認証フロー）・`docs/01_requirements.md` §9（機能No.18）を参照。

## 前提確認

- 画面導線整備（ナビゲーション）が完了していること
- `companies`テーブルに自社（`company_type='own'`）の行が、テストデータとしてではなく**マイグレーションとして**存在するか確認する。無ければStep1で作成する

---

## Step 1: 自社（own）企業の恒久データをマイグレーションで保証

```bash
supabase migration new seed_own_company
```

```sql
insert into companies (id, name, company_type)
values ('00000000-0000-0000-0000-000000000001', '自社', 'own')
on conflict (id) do nothing;
```

**注意**：これまでPhase0 Step2で手動SQLとしてテストユーザー用に投入した`companies`行がこれと同じUUIDであれば重複せずそのまま活きる。異なるUUIDで投入していた場合は、既存データとの整合（どちらを正とするか）を確認すること。

## Step 2: Google SSO初回ログイン時のプロファイル自動作成（トリガー）

```bash
supabase migration new auto_create_user_profile
```

```sql
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Googleでサインアップしたユーザーのみ自動作成する。
  -- パートナー（メール/パスワード）はStep4の管理者操作で明示的に作成するため対象外
  if new.raw_app_meta_data->>'provider' = 'google' then
    insert into user_profiles (user_id, tenant_id, user_role, company_id, auth_provider)
    values (
      new.id,
      '00000000-0000-0000-0000-000000000000', -- 固定tenant_id（単一テナント運用、02_architecture.md参照）
      'member',                                 -- 安全側のデフォルト。昇格は管理者が別途行う
      '00000000-0000-0000-0000-000000000001',  -- Step1で保証した自社company_id
      'google'
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

`supabase db reset` で反映する。

**注意**：新規ユーザーのデフォルトロールは`member`（一般的な操作権限）とする。`admin`/`pm`への昇格は、このStepの範囲では画面を作らずデータベースを直接操作する運用とする（管理者向け昇格UIは将来のPhaseで検討）。

## Step 3: サービスロールクライアントのヘルパーを作成

管理者操作（パートナーアカウント作成、メールでのユーザー検索）には、RLSをバイパスする`service_role`キーが必要。新規ファイル `src/lib/supabase/admin.ts`。

```ts
import { createClient } from "@supabase/supabase-js";

// このクライアントはサーバー側の管理者専用操作でのみ使用する。
// 呼び出し元で必ずuser_role==='admin'等の権限チェックを行ってから使うこと。
// クライアントバンドルに含めない（"use server"ファイルからのみimportする）。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

## Step 4: パートナーアカウント発行のServer Actionを作成

新規ファイル `src/actions/admin-users.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createServerActionClient>>) {
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") {
    throw new Error("管理者のみ実行できます");
  }
}

export async function createPartnerAccount(formData: FormData) {
  const supabase = await createServerActionClient();
  await assertAdmin(supabase);
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const email = formData.get("email") as string;
  const tempPassword = formData.get("temp_password") as string;
  const companyName = formData.get("company_name") as string;

  const admin = createAdminClient();

  // 1. パートナー会社が無ければ作成
  const { data: existingCompany } = await admin
    .from("companies")
    .select("id")
    .eq("name", companyName)
    .eq("company_type", "partner")
    .maybeSingle();

  const companyId = existingCompany?.id ?? (
    await admin.from("companies").insert({ name: companyName, company_type: "partner" }).select("id").single()
  ).data?.id;

  // 2. auth.usersにパートナーアカウントを作成（仮パスワード、メール確認済み扱い）
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (authError || !authUser.user) throw authError ?? new Error("アカウント作成に失敗しました");

  // 3. user_profilesを作成（force_password_reset=trueで初回パスワード変更を強制）
  const { error: profileError } = await admin.from("user_profiles").insert({
    user_id: authUser.user.id,
    tenant_id: tenantId,
    user_role: "partner",
    company_id: companyId,
    auth_provider: "email",
    force_password_reset: true,
  });
  if (profileError) throw profileError;

  revalidatePath("/admin/partners");
}
```

## Step 5: パートナー発行画面を作成（管理者のみ表示）

新規ファイル `src/app/admin/partners/page.tsx`。

```tsx
import { createServerActionClient } from "@/lib/supabase/server";
import { createPartnerAccount } from "@/actions/admin-users";
import { redirect } from "next/navigation";

export default async function AdminPartnersPage() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") {
    redirect("/projects");
  }

  return (
    <div className="max-w-md mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">パートナーアカウント発行</h1>
      <form action={createPartnerAccount} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="メールアドレス" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="temp_password" placeholder="仮パスワード（8文字以上、英数字混在）" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <input name="company_name" placeholder="協力会社名" required className="h-9 border border-border rounded-md px-2 text-sm" />
        <button className="h-9 bg-primary text-white rounded-md text-sm font-medium">発行</button>
      </form>
      <p className="text-xs text-secondary mt-3">
        発行後、仮パスワードは別途安全な手段でご本人に連絡してください。初回ログイン時にパスワード変更が強制されます。
      </p>
    </div>
  );
}
```

## Step 6: 初回ログイン時のパスワード変更強制

`src/app/page.tsx`（Step1で実装済みのルートリダイレクト）を以下のように拡張する。

```tsx
import { redirect } from "next/navigation";
import { createServerActionClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createServerActionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("force_password_reset")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profile?.force_password_reset) redirect("/reset-password");
  redirect("/projects");
}
```

新規ファイル `src/app/reset-password/page.tsx`とパスワード更新のServer Actionを作成する（`supabase.auth.updateUser({ password })`後、`user_profiles.force_password_reset`を`false`に更新する）。既存のログイン画面のスタイルに合わせて簡潔なフォーム1つでよい。

**注意**：`force_password_reset=true`のユーザーが`/projects`等に直接URLでアクセスした場合の遮断は、このStepでは`/`経由のリダイレクトのみで対応する（各ページ個別でのガードは行わない）。厳密な遮断が必要な場合はNext.js middlewareの導入を別途検討する。

## Step 7: 案件へのメンバー追加を実装

`src/actions/admin-users.ts`に追加。

```ts
export async function addProjectMemberByEmail(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new Error("PM以上の権限が必要です");
  }

  const email = formData.get("email") as string;
  const admin = createAdminClient();

  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const targetUser = usersPage.users.find((u) => u.email === email);
  if (!targetUser) throw new Error("指定されたメールアドレスのユーザーが見つかりません");

  const { error } = await supabase.from("project_members").insert({
    project_id: projectId,
    user_id: targetUser.id,
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/members`);
}
```

**注意**：`listUsers()`は全ユーザーを取得してJS側でフィルタする簡易実装。ユーザー数が増えた場合はページネーション（`listUsers({ page, perPage })`）や、`user_profiles`にメールアドレスを非正規化して保持し検索する方式への変更を検討する。

`src/app/projects/[id]/members/page.tsx`（Phase0 Step3で「表示のみ」だったボタン）を、実際に動作するフォームに置き換える。

```tsx
import { addProjectMemberByEmail } from "@/actions/admin-users";
// ...
<form action={addProjectMemberByEmail.bind(null, id)} className="flex gap-2">
  <input name="email" type="email" placeholder="メールアドレス" required className="h-8 border border-border rounded-md px-2 text-xs" />
  <button className="h-8 px-3 border border-border rounded-md text-xs">追加</button>
</form>
```

## Step 8: 動作確認

1. （可能であれば）実際に別のGoogleアカウントでログインし、`user_profiles`に`member`ロールの行が自動作成されることを確認。難しい場合は、ローカルでGoogle認証をシミュレートする方法をCLAUDE.mdやSupabase CLIのドキュメントで確認し、代替検証方法を検討する
2. `/admin/partners`にadmin以外のロールでアクセスすると`/projects`にリダイレクトされることを確認
3. パートナーアカウントを1件発行し、`user_profiles`に`role='partner'`, `force_password_reset=true`で作成されることを確認
4. 発行したパートナーアカウントでログイン→`/reset-password`に強制的に遷移することを確認
5. パスワード変更後、`force_password_reset`が`false`になり、以降`/projects`に通常遷移することを確認
6. 案件詳細（メンバー）画面から、既存ユーザーのメールアドレスを指定してメンバー追加ができることを確認

## やってはいけないこと

- `service_role`キーを使う`createAdminClient()`を、権限チェック無しで呼び出せる状態にしない（`assertAdmin`等のガードを必ず先に通す）
- 新規Googleユーザーに`admin`や`pm`をデフォルト付与しない（`member`が安全側のデフォルト）

## 完了条件

- [ ] 自社companyのマイグレーション化
- [ ] Google SSO初回ログインでのプロファイル自動作成（トリガー）
- [ ] パートナーアカウント発行画面・処理
- [ ] 初回ログイン時のパスワード変更強制
- [ ] 案件へのメンバー追加（メール検索）が動作確認済み
