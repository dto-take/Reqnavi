# 指示書：共通UIコンポーネント化（デザイン精査・本格リファクタ）

## 目的

これまで各Stepで画面ごとに個別にTailwindクラスを書いてきた結果、ボタン・入力欄・カードのスタイルに微妙な不一致（`rounded-md`と`rounded-lg`の混在、ボタンの高さ`h-8`/`h-9`の使い分けが不統一等）が生じている。共通コンポーネント（Button/Input/Textarea/Select/Card/PageHeader/Label）を作成し、全画面をこれらに置き換えることで、デザインの一貫性を担保する。デザイントークン自体（色・フォント・角丸の基本値）はPhase0 Step1のものを踏襲し、変更しない。

## 前提確認

- Phase4 Step1、TD-004解消が完了していること

---

## Step 1: 共通コンポーネント一式を作成

新規ファイル `src/components/ui/button.tsx`。

```tsx
import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-white hover:opacity-90 disabled:opacity-50",
  secondary: "border border-border text-primary hover:bg-hover disabled:opacity-50",
  ghost: "text-secondary hover:text-primary underline disabled:opacity-50 disabled:no-underline",
  danger: "text-[#AF3D3D] hover:underline disabled:opacity-50",
};
const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base = variant === "ghost" ? "inline-flex items-center" : `inline-flex items-center justify-center font-medium ${SIZE_CLASSES[size]}`;
  return <button className={`${base} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
```

新規ファイル `src/components/ui/input.tsx`。

```tsx
import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 border border-border rounded-md px-2 text-sm bg-page outline-none focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`border border-border rounded-md px-2 py-1.5 text-sm bg-page outline-none focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-9 border border-border rounded-md px-2 text-sm bg-page ${className}`}
      {...props}
    />
  );
}
```

新規ファイル `src/components/ui/label.tsx`。

```tsx
export function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-secondary block mb-1">{children}</label>;
}
```

新規ファイル `src/components/ui/card.tsx`。

```tsx
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-page border border-border rounded-lg p-6 ${className}`}>{children}</div>;
}
```

新規ファイル `src/components/ui/page-header.tsx`。

```tsx
export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-base font-semibold text-primary">{title}</h1>
      {action}
    </div>
  );
}
```

## Step 2: 適用例（2画面をまず置き換える）

### 例1：ログイン画面（`src/app/login/page.tsx`）

```tsx
import { signInWithPassword, signInWithGoogle } from "@/actions/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar">
      <Card className="w-[360px]">
        <h1 className="text-xl font-semibold text-primary mb-1">ReqNavi</h1>
        <p className="text-sm text-secondary mb-5">要件定義を、迷わず前へ</p>

        <form action={signInWithPassword} className="flex flex-col gap-3">
          <div>
            <Label>メールアドレス</Label>
            <Input name="email" type="email" required className="w-full" />
          </div>
          <div>
            <Label>パスワード</Label>
            <Input name="password" type="password" required className="w-full" />
          </div>
          <Button type="submit" variant="primary" className="w-full mt-1">サインイン</Button>
        </form>

        <form action={signInWithGoogle} className="mt-2">
          <Button type="submit" variant="secondary" className="w-full">Googleで続ける</Button>
        </form>
      </Card>
    </div>
  );
}
```

### 例2：案件一覧画面（`src/app/projects/page.tsx`）

```tsx
import Link from "next/link";
import { listProjects } from "@/actions/projects";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <Card className="max-w-4xl mx-auto mt-10">
      <PageHeader
        title="案件一覧"
        action={<Link href="/projects/new"><Button variant="primary" size="sm">+ 新規案件</Button></Link>}
      />
      <div className="flex flex-col">
        {projects?.map((p: any) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="grid grid-cols-4 items-center p-2.5 border-t border-[#F1F1EF] hover:bg-hover text-sm">
            <span className="font-medium text-primary">{p.name}</span>
            <span className="text-secondary">{p.organizations?.name}</span>
            <span><StatusBadge status="ai_draft" /></span>
            <span className="text-secondary">Salesforce</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
```

## Step 3: 残り全画面への展開

以下の全ファイルについて、Step2と同じ考え方（生の`<button>`/`<input>`/`<textarea>`/`<select>`/カード用`<div>`/見出し部分を、それぞれ`Button`/`Input`/`Textarea`/`Select`/`Card`/`PageHeader`/`Label`に置き換える）で修正する。

- `src/app/reset-password/page.tsx`
- `src/app/admin/partners/page.tsx`
- `src/app/projects/new/page.tsx`
- `src/app/projects/[id]/members/page.tsx`
- `src/app/projects/[id]/settings/page.tsx`
- `src/app/projects/[id]/documents/page.tsx`
- `src/app/projects/[id]/business-flow/page.tsx`
- `src/app/projects/[id]/business-flow/diff/page.tsx`
- `src/app/projects/[id]/effort/page.tsx`
- `src/app/projects/[id]/readiness/page.tsx`
- `src/app/projects/[id]/consistency/page.tsx`
- `src/app/projects/[id]/changes/page.tsx`
- `src/app/projects/[id]/baseline/page.tsx`
- `src/app/projects/[id]/chapters/[chapterNo]/page.tsx`
- `src/app/projects/[id]/chapters/[chapterNo]/consistency/page.tsx`
- `src/app/projects/[id]/chapters/[chapterNo]/cross-reference/page.tsx`
- `src/app/projects/[id]/chapters/4/page.tsx`
- `src/app/projects/[id]/chapters/9/screens/page.tsx`
- `src/app/projects/[id]/chapters/9/screen-transitions/page.tsx`
- `src/app/projects/[id]/chapters/10/page.tsx`
- `src/app/projects/[id]/chapters/15/page.tsx`
- `src/components/domain/requirement-table/RequirementTable.tsx`
- `src/components/domain/kpi-tree/KpiTree.tsx`
- `src/components/domain/nonfunctional-checklist/ChecklistCard.tsx`

**注意（CLAUDE.md規約36・37の教訓を適用）**：上記リストは会話の記録から手作業で列挙したものであり、漏れがある可能性が高い。作業前に以下を実行し、リストに無いファイルが無いか確認すること。

```bash
grep -rln 'className="h-9 border border-border rounded-md\|className="h-8 px-3 border border-border rounded-md\|bg-page border border-border rounded-lg p-6' src/app src/components
```

このパターンに一致するがStep3のリストに無いファイルが見つかった場合、そちらも同様に修正する。

## Step 4: 動作確認

1. `tsc --noEmit` / `eslint src` がクリアであることを確認する
2. 主要な画面（ログイン、案件一覧、いずれかの章ページ、業務フロー、確定判定ダッシュボード）を実ブラウザで開き、ボタンの高さ・角丸・余白が視覚的に統一されていることを確認する
3. フォームの送信（ログイン、案件作成、資料アップロード等、代表的なもの2〜3個）が置き換え後も正常に動作することを確認する
4. `disabled`状態のボタン（例：確定済み項目の編集不可時）が、`Button`コンポーネントの`disabled:opacity-50`によって視覚的にも分かるようになっていることを確認する

## やってはいけないこと

- デザイントークン自体（`--bg-page`等のCSS変数の値）を変更しない。今回はコンポーネント化のみで、配色・角丸の基本値は変えない
- `Button`/`Input`等のコンポーネントに、ページ固有のロジック（Server Actionの呼び出し等）を持ち込まない（あくまで見た目のみの共通化に留める）

## 完了条件

- [ ] 共通コンポーネント一式（Button/Input/Textarea/Select/Label/Card/PageHeader）作成済み
- [ ] Step3の全ファイル（およびgrepで追加発見したファイル）が置き換え済み
- [ ] 主要画面で視覚的な統一性を確認済み
- [ ] 既存機能（フォーム送信等）が退行していないことを確認済み
