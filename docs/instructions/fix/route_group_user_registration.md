# 指示書：ナビゲーションの根本修正（ルートグループ化）・ユーザー登録機能の追加

## 目的

1. `/organizations`（顧客管理）・`/admin/users`（ユーザ管理）が、共通ヘッダー（`/projects/layout.tsx`）の外にあるため、遷移すると戻れなくなる問題を修正する
2. `/admin/users`に、ユーザーアカウントを直接作成できる機能を追加する（これまで`/admin/partners`にのみあったアカウント作成機能を一般化する）

## 前提確認

- ヘルプ・使い方パネルの実装が完了していること

---

## Step 1: ルートグループでヘッダーを共通化

Next.jsの「ルートグループ」（括弧付きフォルダ、URLには影響しない）を使い、`/projects`・`/organizations`・`/admin`を同じ共通ヘッダーの下にまとめる。

1. 新規フォルダ `src/app/(app)/` を作成する
2. `src/app/projects/`フォルダ全体（`layout.tsx`含む）を `src/app/(app)/projects/` に移動する
3. `src/app/organizations/`フォルダ全体を `src/app/(app)/organizations/` に移動する
4. `src/app/admin/`フォルダ全体を `src/app/(app)/admin/` に移動する
5. 移動した`src/app/(app)/projects/layout.tsx`の中身（ヘッダー部分）を、より上位の `src/app/(app)/layout.tsx` に引き上げる。案件のサイドバー（章一覧等）は`src/app/(app)/projects/[id]/layout.tsx`としてそのまま残す（ヘッダー部分だけを`(app)/layout.tsx`に引き上げ、サイドバー部分は`(app)/projects/[id]/layout.tsx`に残す形になる）

```
src/app/(app)/layout.tsx           … 共通ヘッダー（ロゴ・ユーザー名・ログアウト・顧客管理/ユーザ管理リンク）
src/app/(app)/projects/page.tsx    … 案件一覧
src/app/(app)/projects/new/page.tsx
src/app/(app)/projects/[id]/layout.tsx  … 案件内サイドバー（既存のサイドバー）
src/app/(app)/projects/[id]/...    … 既存の各章・機能ページ
src/app/(app)/organizations/page.tsx
src/app/(app)/admin/users/page.tsx
src/app/(app)/admin/partners/page.tsx
```

**注意**：URLパス自体は変更されない（`(app)`は括弧付きのためルーティングに現れない）。既存の全ての`href`・`redirect`先の文字列は変更不要である。`import`パス（`@/`から始まる絶対パス）も変更不要のはずだが、移動後に`tsc --noEmit`でエラーが出ないか必ず確認すること。

移動後、`(app)/layout.tsx`（共通ヘッダー）と`(app)/projects/[id]/layout.tsx`（案件サイドバー）が、ネストされたレイアウトとして両方同時に正しく適用されるか実機で確認する。

## Step 2: ユーザー登録機能を/admin/usersに追加

`src/actions/user-management.ts`に、汎用的なアカウント作成関数を追加する。

```ts
export async function createUserAccount(formData: FormData) {
  const supabase = await createServerActionClient();
  await assertAdmin(supabase);
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const email = formData.get("email") as string;
  const tempPassword = formData.get("temp_password") as string;
  const userRole = formData.get("user_role") as string;
  const companyName = formData.get("company_name") as string;

  const admin = createAdminClient();

  const { data: existingCompany } = await admin
    .from("companies")
    .select("id")
    .eq("name", companyName)
    .maybeSingle();

  let companyId = existingCompany?.id;
  if (!companyId) {
    const companyType = userRole === "partner" ? "partner" : "own";
    const { data: newCompany, error: companyError } = await admin
      .from("companies")
      .insert({ name: companyName, company_type: companyType })
      .select("id")
      .single();
    if (companyError || !newCompany) throw companyError ?? new Error("会社の作成に失敗しました");
    companyId = newCompany.id;
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (authError || !authUser.user) throw authError ?? new Error("アカウント作成に失敗しました");

  const { error: profileError } = await admin.from("user_profiles").insert({
    user_id: authUser.user.id,
    tenant_id: tenantId,
    user_role: userRole,
    company_id: companyId,
    auth_provider: "email",
    force_password_reset: true,
  });
  if (profileError) throw profileError;

  revalidatePath("/admin/users");
}
```

**注意**：`user_role`に`admin`を選んで作成できてしまう点は意図的（管理者自身が別の管理者アカウントを作る正当な用途があるため）。この新規作成（INSERT）はadmin権限チェック（`assertAdmin`）のみで保護されている点を認識しておくこと（規約39のトリガーはUPDATE時のみの保護であり、この新規作成の唯一の防衛線は`assertAdmin`である）。このガードを絶対に外さないこと。

`src/app/admin/users/page.tsx`（移動後は`src/app/(app)/admin/users/page.tsx`）に、作成フォームを追加する。

```tsx
import { createUserAccount } from "@/actions/user-management";

const ROLES = ["admin", "exec", "pmo", "pm", "member", "partner"];

<Card className="mt-4">
  <h2 className="text-sm font-semibold text-primary mb-3">新規ユーザーを登録</h2>
  <form action={createUserAccount} className="grid grid-cols-2 gap-2">
    <div>
      <Label>メールアドレス</Label>
      <Input name="email" type="email" required className="w-full" />
    </div>
    <div>
      <Label>仮パスワード</Label>
      <Input name="temp_password" required className="w-full" />
    </div>
    <div>
      <Label>ロール</Label>
      <Select name="user_role" required className="w-full">
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </Select>
    </div>
    <div>
      <Label>所属会社</Label>
      <Input name="company_name" placeholder="既存の会社名、または新規会社名" required className="w-full" />
    </div>
    <SubmitButton pendingText="登録中..." className="col-span-2">登録</SubmitButton>
  </form>
  <p className="text-xs text-faint mt-2">
    発行後、仮パスワードは別途安全な手段でご本人に連絡してください。初回ログイン時にパスワード変更が強制されます。
  </p>
</Card>
```

## Step 3: 動作確認

1. `/organizations`・`/admin/users`（admin権限）にアクセスし、共通ヘッダー（ロゴ・ユーザー名・ログアウト・顧客管理/ユーザ管理リンク）が表示されることを確認する
2. ヘッダーの各リンクから、`/projects`・`/organizations`・`/admin/users`の間を自由に行き来できることを確認する
3. `/projects/{id}`（案件内）に移動した際、案件のサイドバー（章一覧等）も引き続き正しく表示されることを確認する
4. `/admin/users`から、新しいユーザーアカウント（例：`member`ロール）を作成する
5. 作成したアカウントでログインし、`/reset-password`に強制遷移すること、パスワード変更後は通常通り利用できることを確認する
6. `partner`ロールで作成した場合も同様に機能することを確認する（既存の`/admin/partners`と同等の結果になること）

## やってはいけないこと

- ルートグループへの移動時に、URLパスを変更しない
- `createUserAccount`から`assertAdmin`のガードを外さない

## 完了条件

- [ ] ルートグループ化により、`/organizations`・`/admin/users`からも他画面へ遷移できることを確認済み
- [ ] 案件内サイドバーが引き続き正しく機能することを確認済み
- [ ] `/admin/users`からのユーザー登録が動作確認済み
