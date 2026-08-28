# 指示書：見栄えの向上・ローディング表示・ブランドアイコン

## 目的

1. ログイン後の画面（特に案件一覧）が、余白の中にカードがぽつんと浮いているだけで寂しい印象になっている。全体の構成を見直し、画面らしい情報量・視覚的な密度にする。
2. AI呼び出し（素案生成・曖昧判定・Salesforce提案等）はレスポンスに数秒〜十数秒かかるが、ボタンを押した後の待ち時間に何も反応が無く、動いているのか分からない。ローディング表示を追加する。
3. ReqNaviのブランドアイコン（サービスロゴ）を用意し、ログイン画面・サイドバー等に表示する。

デザインの具体的な余白・配色の微調整・アイコンの形状等は、既存のデザイントークン（Notion系トーン、Interフォント）を守った上でCLAUDE Code側の判断に委ねてよい。以下は技術的に実現してほしい要件として明記する。

## 前提確認

- 共通UIコンポーネント化（Button/Input/Card等）が完了していること

---

## Step 1: ローディング表示の仕組みを作る

新規ファイル `src/components/ui/spinner.tsx`。

```tsx
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" width="16" height="16">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
```

新規ファイル `src/components/ui/submit-button.tsx`（`react-dom`の`useFormStatus`を使い、フォーム送信中に自動でローディング表示に切り替わるボタン）。

```tsx
"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function SubmitButton({
  children,
  pendingText = "処理中...",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string; variant?: Variant }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} {...props}>
      {pending ? (
        <span className="flex items-center gap-1.5">
          <Spinner /> {pendingText}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
```

**注意**：`useFormStatus`は、そのフォームの**子コンポーネント内**でのみ動作する（フォーム自体と同じコンポーネントでは動かない）。`<form action={...}><SubmitButton>...</SubmitButton></form>`のように必ずフォームの内側から使うこと。

以下の、AI呼び出しを伴う既存のボタンを`SubmitButton`に置き換える（対象は`grep -rn "form action="`で洗い出し、AI呼び出し系のactionのみ対象にする）。

- 「AI素案を生成」（`generateDraft`） — `pendingText="AIが資料を分析中..."`
- 「曖昧表現チェック」（`runAmbiguousCheck`） — `pendingText="チェック中..."`
- 「AI曖昧判定（詳細）」（`runAmbiguousCheckAI`） — `pendingText="AIが判定中..."`
- 「Salesforce機能を提案」（`suggestPlatformFeature`） — `pendingText="提案を作成中..."`
- 資料アップロードの「アップロード」ボタン（`uploadDocument`、分類のAI呼び出しを含む） — `pendingText="分類中..."`

## Step 2: AI素案生成のみ、より丁寧なローディング表現にする

「AI素案を生成」は複数資料を読み込むため特に時間がかかりやすい。専用のクライアントコンポーネントで、待機中に文言が切り替わる表現にする。

新規ファイル `src/components/domain/ai-generate-button.tsx`。

```tsx
"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const MESSAGES = ["資料を読み込んでいます...", "AIが内容を分析中...", "項目を整理しています...", "もうすぐ完了します..."];

export function AiGenerateButton() {
  const { pending } = useFormStatus();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!pending) {
      setMessageIndex(0);
      return;
    }
    const interval = setInterval(() => setMessageIndex((i) => (i + 1) % MESSAGES.length), 2500);
    return () => clearInterval(interval);
  }, [pending]);

  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? (
        <span className="flex items-center gap-1.5">
          <Spinner /> {MESSAGES[messageIndex]}
        </span>
      ) : (
        "AI素案を生成"
      )}
    </Button>
  );
}
```

「AI素案を生成」ボタンの箇所を、この`AiGenerateButton`に差し替える。

## Step 3: ブランドアイコンを作成

`src/app/icon.svg`（Next.jsの規約により、ここに置くとファビコン・タブアイコンとして自動的に使われる）。ReqNaviの世界観（要件定義を迷わず進める、道しるべ）に合う、シンプルな幾何学的アイコンをSVGで作成する。既存のトークン（`--text-primary: #37352F`等）を基調に、単色〜2色程度の落ち着いたデザインにする（具体的なモチーフ・形状はお任せする。例：コンパス、経路を示す矢印、チェックマークとの組み合わせ等）。

サイドバー（`src/app/projects/[id]/layout.tsx`）およびログイン画面の「ReqNavi」ロゴ文字の隣に、このアイコンを表示する。

## Step 4: 案件一覧画面（ログイン後の最初の画面）の拡張

現状、案件一覧は小さなカードが画面左上に浮いているだけで寂しい。以下の要素を追加し、情報量・視覚的な密度を上げる。

- ページ全体にヘッダー（ReqNaviロゴ＋アイコン、ユーザー名やログアウト導線）を常設する。現状ログイン後の画面にはこの種のヘッダーが無いため、`src/app/(authenticated)/layout.tsx`のような共通レイアウトを新設し、`/projects`一覧ページにも適用する
- 案件一覧のカード自体も、単なるリストではなく各案件のサマリー情報（進捗・確定率等、`readiness`機能で使っているデータを流用できる）を軽く見せるカード形式に拡張することを検討する（実装コストが高い場合は次回以降に回してよい）
- 画面全体の横幅の使い方を見直し、大きな余白が不自然に残らないよう、コンテンツ幅・余白のバランスを調整する

**この項目は具体的な実装をお任せする。** 「情報量が増え、余白の使い方に違和感が無い状態」を目標として、Next.js/Tailwindのベストプラクティスに沿って自由に構成してよい。

## Step 5: 動作確認

1. AI素案生成ボタンを押し、押した瞬間からスピナーと「資料を読み込んでいます...」等の文言が表示され、数秒ごとにメッセージが切り替わることを確認する
2. 曖昧表現チェック等、他のAI呼び出しボタンでも同様にローディング表示が出ることを確認する
3. ブラウザのタブにReqNaviのアイコンが表示されることを確認する
4. ログイン後の案件一覧画面が、以前より視覚的に落ち着いた・寂しくない印象になっていることを確認する（主観評価でよい）
5. 既存の全ページのレイアウトが崩れていないことを一通り確認する

## やってはいけないこと

- ローディング表示のために新しい状態管理ライブラリを追加しない（`useFormStatus`とReactの標準機能で完結させる）
- デザイントークン自体（色・フォントの基本値）を変更しない

## 完了条件

- [ ] `SubmitButton`・`Spinner`実装済み、AI呼び出し系ボタンに適用済み
- [ ] AI素案生成に専用のローディング表現（メッセージ切り替え）実装済み
- [ ] ブランドアイコン（`icon.svg`）作成済み、サイドバー・ログイン画面に表示済み
- [ ] 案件一覧画面の拡張（ヘッダー追加等）実装済み
- [ ] 主要画面での視覚的な改善を確認済み
