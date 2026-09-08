# 指示書：Phase0 Step2 JWTカスタムクレーム発行（custom-access-token-hook）

## 目的

ログイン時に発行されるJWTに `tenant_id` / `user_role` / `company_id` を付与する。これが無いと、RLSに依存する以降の全機能（案件管理・要件項目等）が動作しない。詳細仕様は `docs/02_architecture.md` 3章を参照。

## 前提確認

- Step1（デザイントークン・ログイン画面）が完了していること
- ローカルSupabaseが起動していること（`supabase status`で確認）

---

## Step 1: user_profiles テーブルを追加

新しいマイグレーションを作成する。

```bash
supabase migration new add_user_profiles
```

生成された `supabase/migrations/日付_add_user_profiles.sql` に以下を記述する。

```sql
create table user_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  tenant_id     uuid not null,
  user_role     text not null check (user_role in ('admin','exec','pmo','pm','member','partner')),
  company_id    uuid references companies(id),
  auth_provider text not null check (auth_provider in ('google','email')),
  force_password_reset boolean not null default false,
  display_name  text,
  created_at    timestamptz default now(),
  constraint partner_no_google check (
    (auth_provider = 'google' and user_role != 'partner') or (auth_provider = 'email')
  )
);

alter table user_profiles enable row level security;

-- 本人のプロファイルのみ参照可（管理者向けポリシーは別途Phase1後半で追加）
create policy "own_profile_read" on user_profiles
  for select using (auth.uid() = user_id);
```

`supabase db reset` で反映する。

## Step 2: テストユーザーのプロファイル行を作成

Supabase StudioのSQL Editorで、前段で作成したテストユーザーのUUIDを使い、以下を実行する（`<test-user-uuid>` は実際の値に置き換える）。

```sql
insert into companies (id, name, company_type)
values ('00000000-0000-0000-0000-000000000001', '自社', 'own');

insert into user_profiles (user_id, tenant_id, user_role, company_id, auth_provider)
values (
  '<test-user-uuid>',
  '00000000-0000-0000-0000-000000000000', -- 現状は固定のtenant_id
  'pm',
  '00000000-0000-0000-0000-000000000001',
  'email'
);
```

## Step 3: Edge Function を作成

```bash
supabase functions new custom-access-token-hook
```

生成された `supabase/functions/custom-access-token-hook/index.ts` を以下に置き換える。

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const payload = await req.json();
  const userId = payload.user_id;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("tenant_id, user_role, company_id")
    .eq("user_id", userId)
    .single();

  if (error || !profile) {
    // プロファイル未登録のユーザーはログイン自体は通すが、権限系クレームは付与しない
    // （RLSにより実質すべてのデータアクセスが拒否される安全側の挙動）
    return new Response(JSON.stringify({ claims: payload.claims }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const claims = {
    ...payload.claims,
    tenant_id: profile.tenant_id,
    user_role: profile.user_role,
    company_id: profile.company_id,
  };

  return new Response(JSON.stringify({ claims }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

**注意**：クレーム名は必ず `user_role`（`role`は使わない。Supabase予約語と衝突するため。`CLAUDE.md`参照）。

## Step 4: フックをローカル設定に登録

`supabase/config.toml` に以下を追記する（`[auth]`セクション内、無ければ新規セクションとして追加）。

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

**この`uri`はSupabase CLIのバージョンにより指定方法が異なる場合がある。** Postgres関数として登録する方式とHTTP（Edge Function）として登録する方式の2通りが存在するため、`supabase --version`を確認のうえ、公式ドキュメント（Auth Hooks: Customize Access Token）の該当バージョンの手順に従って`uri`の値を確定させること。ここで詰まった場合は自己判断で進めず、エラーメッセージを共有して確認を仰ぐこと。

## Step 5: 再起動して反映

```bash
supabase stop
supabase start
```

## Step 6: 動作確認

1. `http://localhost:3000/login` からStep1で作成したテストユーザー（`test-pm@example.com`）でログイン
2. ログイン後、ブラウザの開発者ツール → Application/Storage → Cookiesから、SupabaseのセッションJWTを確認するか、以下を一時的にどこかのServer Componentに追加して確認する

```ts
const { data: { session } } = await supabase.auth.getSession();
console.log(session?.access_token); // jwt.io 等でデコードし、tenant_id/user_role/company_idが含まれるか確認
```

3. デコードしたJWTのペイロードに `tenant_id` `user_role` `company_id` が含まれていることを確認する

## やってはいけないこと

- `user_profiles`のRLSを無効化しない
- Edge Function内で`SUPABASE_SERVICE_ROLE_KEY`をハードコードしない（環境変数から取得する）
- `role`というクレーム名を使わない（`user_role`のみ）

## 完了条件

- [ ] `user_profiles`テーブル作成・RLS有効化済み
- [ ] テストユーザーのプロファイル行を作成済み
- [ ] `custom-access-token-hook` Edge Function作成済み
- [ ] フック登録済み（config.toml、または公式手順に沿った方式）
- [ ] ログイン後のJWTに`tenant_id`/`user_role`/`company_id`が含まれることを確認済み
