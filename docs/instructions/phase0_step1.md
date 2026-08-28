# 指示書：Phase1 Step1 デザイントークン・ログイン画面

## 目的

ReqNaviのデザイントークン（Notion系ライトトーン）を確立し、ステータスバッジ共通部品とログイン画面（メール/パスワード + Google OAuth）を実装する。詳細な背景は `docs/01_requirements.md`・`docs/02_architecture.md` を参照。

## 前提確認

作業開始前に以下を確認すること。存在しない場合は先に該当パッケージを追加する。

```bash
# 以下がpackage.jsonに無ければ追加
npm list @supabase/ssr @supabase/supabase-js next
```

`@supabase/ssr` が無ければ `npm install @supabase/ssr @supabase/supabase-js` を実行する。

`.env.local` に以下が設定済みであることを確認する（未設定なら作業を中断しユーザーに確認する）。

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Step 1: デザイントークンを追加（Tailwind v4 / CSS-first構成）

本プロジェクトはTailwind v4（`tailwind.config.ts`なし、CSS内`@theme`でテーマ定義）である。`src/app/globals.css`を以下の内容に更新する（既存の`@import "tailwindcss";`等がある場合は重複させず統合する）。

```css
@import "tailwindcss";

:root {
  --bg-page: #FFFFFF;
  --bg-sidebar: #FBFBFA;
  --bg-hover: #F1F1EF;
  --text-primary: #37352F;
  --text-secondary: #787774;
  --text-faint: #9B9A97;
  --border: #E9E9E7;

  --status-draft-bg: #EDECE9;      --status-draft-text: #787774;
  --status-review-bg: #FDECC8;     --status-review-text: #9F6B00;
  --status-confirmed-bg: #DBEDDB;  --status-confirmed-text: #448361;
  --status-needhearing-bg: #FBE4E4; --status-needhearing-text: #AF3D3D;
}

@theme inline {
  --color-page: var(--bg-page);
  --color-sidebar: var(--bg-sidebar);
  --color-hover: var(--bg-hover);
  --color-primary: var(--text-primary);
  --color-secondary: var(--text-secondary);
  --color-faint: var(--text-faint);
  --color-border: var(--border);
  --font-sans: var(--font-inter), sans-serif;
}

body {
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-inter), sans-serif;
}
```

`@theme inline`で`--color-*`を定義すると、Tailwind v4が自動的に`bg-page` `text-primary` `border-border`等のユーティリティクラスを生成する。

## Step 2: （Tailwind v4のため不要・スキップ）

`tailwind.config.ts`によるcolors/borderRadiusの拡張はStep1に統合済みのため、このStepはスキップする。角丸は各コンポーネントのコード内で`rounded-md`（6px）・`rounded-lg`（8px）を直接指定する方式とする（Step7参照）。

## Step 3: フォント（Inter）を読み込む

`src/app/layout.tsx` を開き、`next/font/google` でInterを読み込むよう変更する。既存のフォント設定があれば置き換える。

```tsx
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

## Step 4: Supabaseサーバークライアントのヘルパーを作成（未作成の場合のみ）

`src/lib/supabase/server.ts` が存在しない場合、新規作成する。存在する場合はこのStepをスキップする。

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerActionClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

## Step 5: ステータスバッジ共通コンポーネントを作成

新規ファイル `src/components/ui/status-badge.tsx` を作成する。

```tsx
type Status = "ai_draft" | "se_reviewing" | "confirmed" | "need_hearing";

const STATUS_MAP: Record<Status, { label: string; bg: string; text: string }> = {
  ai_draft:      { label: "AI素案",     bg: "var(--status-draft-bg)",      text: "var(--status-draft-text)" },
  se_reviewing:  { label: "SE確認中",   bg: "var(--status-review-bg)",     text: "var(--status-review-text)" },
  confirmed:     { label: "確定",       bg: "var(--status-confirmed-bg)",  text: "var(--status-confirmed-text)" },
  need_hearing:  { label: "要ヒアリング", bg: "var(--status-needhearing-bg)", text: "var(--status-needhearing-text)" },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, bg, text } = STATUS_MAP[status];
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}
```

`status` の値は `requirement_items.status`（`docs/02_architecture.md` 2.2節）のうち `ai_draft` / `se_reviewing` / `confirmed` に対応する。`exception_approved` はこのStepでは未対応のままでよい（Phase3で拡張）。

## Step 6: 認証Server Actionsを作成

新規ファイル `src/actions/auth.ts` を作成する。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signInWithPassword(formData: FormData) {
  const supabase = await createServerActionClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/");
}

export async function signInWithGoogle() {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "unknown")}`);
  }
  redirect(data.url);
}
```

## Step 7: ログイン画面を作成

新規ファイル `src/app/login/page.tsx` を作成する。

```tsx
import { signInWithPassword, signInWithGoogle } from "@/actions/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar">
      <div className="w-[360px] bg-page border border-border rounded-lg p-6">
        <h1 className="text-xl font-semibold text-primary mb-1">ReqNavi</h1>
        <p className="text-sm text-secondary mb-5">要件定義を、迷わず前へ</p>

        <form action={signInWithPassword} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-secondary block mb-1">メールアドレス</label>
            <input
              name="email"
              type="email"
              required
              className="w-full h-9 border border-border rounded-md bg-sidebar px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1">パスワード</label>
            <input
              name="password"
              type="password"
              required
              className="w-full h-9 border border-border rounded-md bg-sidebar px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            className="h-9 bg-primary text-white rounded-md text-sm font-medium mt-1"
          >
            サインイン
          </button>
        </form>

        <form action={signInWithGoogle} className="mt-2">
          <button
            type="submit"
            className="w-full h-9 border border-border rounded-md text-sm font-medium flex items-center justify-center gap-2"
          >
            Googleで続ける
          </button>
        </form>
      </div>
    </div>
  );
}
```

## Step 8: 動作確認

1. `npm run dev` を実行
2. ブラウザで `http://localhost:3000/login` を開く
3. 以下を目視確認する
   - 背景がごく薄いグレー（`--bg-sidebar`）、カードが白（`--bg-page`）になっている
   - フォントがInterで表示されている
   - 「サインイン」ボタンが黒地に白文字
   - 「Googleで続ける」ボタンが枠線のみのスタイル
4. TypeScriptエラー・ESLintエラーが無いことを確認する（`npm run lint`）

## やってはいけないこと

- `SUPABASE_SERVICE_ROLE_KEY` をこの画面・Server Action内で使用しない（このStepでは`anon key`のみで完結する）
- `NEXT_PUBLIC_` プレフィックスをService Role Keyに付けない
- パートナー（`user_role = 'partner'`）のGoogle OAuth制限ロジックをこのStepで実装する必要はない（JWT発行時のEdge Function側の責務であり、後続Stepで対応する）

## 完了条件

- [ ] `globals.css` にトークン追加済み
- [ ] `layout.tsx` でInter読み込み済み
- [ ] `src/components/ui/status-badge.tsx` 作成済み
- [ ] `src/actions/auth.ts` 作成済み
- [ ] `src/app/login/page.tsx` 作成済み、`localhost:3000/login` で表示確認済み
