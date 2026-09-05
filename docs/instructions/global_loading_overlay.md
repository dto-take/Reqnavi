# 指示書：全体ローディングオーバーレイ（ブランドアイコン使用）

## 目的

リンク・ボタンを押した際の待ち時間に、画面全体を覆うローディング表示（ブランドアイコンのアニメーション）を出す。以下2種類の「待ち時間」をカバーする。

1. **ページ遷移の待ち時間**（Next.js標準の`loading.tsx`機構を使う）
2. **同一画面内でのボタン操作の待ち時間**（AI生成・確定・削除・アップロード等、既存の個別スピナーに加えて全画面オーバーレイも表示する）

## 前提確認

- 分類タグの突き合わせ確認が完了していること

---

## Step 1: ブランドアイコンの回転アニメーションをCSSに追加

`src/app/globals.css`に追加する。

```css
@keyframes spin-slow {
  to { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 1.2s linear infinite;
}
```

## Step 2: 共通のブランドスピナー表示コンポーネントを作成

新規ファイル `src/components/ui/brand-spinner.tsx`。

```tsx
export function BrandSpinner({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <img src="/icon.svg" alt="" className="w-12 h-12 animate-spin-slow" />
      <span className="text-sm text-secondary">{label}</span>
    </div>
  );
}
```

**注意**：`src/app/icon.svg`（見栄え向上Stepで作成済みのブランドアイコン）を`<img>`で参照する。Next.jsの`icon.svg`規約ファイルは通常ファビコン用途で`public`配下に無いことがあり、その場合`<img src="/icon.svg">`で直接参照できない。参照できない場合は、`public/brand-icon.svg`として同じアイコンをコピーし、そちらを参照する形に変更すること。

## Step 3: ページ遷移用のローディング画面を作成

新規ファイル `src/app/loading.tsx`。

```tsx
import { BrandSpinner } from "@/components/ui/brand-spinner";

export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-page/80 backdrop-blur-sm">
      <BrandSpinner label="ページを読み込んでいます..." />
    </div>
  );
}
```

同様に `src/app/projects/[id]/loading.tsx` も作成する。

```tsx
import { BrandSpinner } from "@/components/ui/brand-spinner";

export default function ProjectLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-page/80 backdrop-blur-sm">
      <BrandSpinner label="読み込んでいます..." />
    </div>
  );
}
```

**注意**：`loading.tsx`はNext.js App Routerの規約ファイルであり、対応する`page.tsx`が非同期のデータ取得を行っている間、自動的に表示される。追加のJSでの発火処理は不要。

## Step 4: 同一画面内の操作用に、グローバルなローディング状態を作成

新規ファイル `src/components/ui/loading-overlay.tsx`。

```tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { BrandSpinner } from "@/components/ui/brand-spinner";

type LoadingContextValue = { increment: () => void; decrement: () => void };
const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingOverlayProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  const decrement = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  return (
    <LoadingContext.Provider value={{ increment, decrement }}>
      {children}
      {count > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-page/80 backdrop-blur-sm">
          <BrandSpinner label="処理中..." />
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useGlobalPending(isPending: boolean) {
  const ctx = useContext(LoadingContext);
  useEffect(() => {
    if (!ctx || !isPending) return;
    ctx.increment();
    return () => ctx.decrement();
  }, [isPending, ctx]);
}
```

`src/app/layout.tsx`（ルートレイアウト）で、既存の`ToastProvider`とあわせてラップする。

```tsx
import { LoadingOverlayProvider } from "@/components/ui/loading-overlay";

<ToastProvider>
  <LoadingOverlayProvider>{children}</LoadingOverlayProvider>
</ToastProvider>
```

## Step 5: 既存のpending状態を持つコンポーネントに組み込む

`src/components/ui/submit-button.tsx`に追加する。

```tsx
import { useGlobalPending } from "@/components/ui/loading-overlay";

const { pending } = useFormStatus();
useGlobalPending(pending);
```

`src/components/domain/ai-generate-button.tsx`にも同様に追加する。

**それ以外の`useTransition`を使っている全コンポーネントを洗い出し、同様に追加する。**

```bash
grep -rln "useTransition" src/components src/app
```

各コンポーネント内で、既存の`const [isPending, startTransition] = useTransition();`の直後に`useGlobalPending(isPending);`を1行追加するだけでよい。

## Step 6: 動作確認

1. 案件一覧から案件を開く等、通常のページ遷移で、画面全体にブランドアイコンの回転アニメーション＋「ページを読み込んでいます...」が一瞬表示されることを確認する
2. 「AI素案を生成」を実行し、既存のボタン内スピナーに加えて、画面全体を覆うオーバーレイが表示されることを確認する
3. 資料の一括アップロード・AI素案の一括生成等、複数の非同期処理が連続する操作でも、処理中は継続してオーバーレイが表示され続け、全て完了した時点で消えることを確認する（カウンタ方式が正しく機能しているか）
4. 確定・例外承認・削除等の細かい操作でも、オーバーレイが一瞬表示されることを確認する
5. オーバーレイ表示中に、背後の画面が操作できない（クリックが貫通しない）ことを確認する
6. 処理が非常に速く終わる操作で、オーバーレイがちらつく場合、体感的に不快でないか確認する。気になる場合は、表示開始から最低200ms程度は表示を維持する等の調整を検討する（この微調整はお任せする）

## やってはいけないこと

- グローバルオーバーレイの導入によって、既存の個別スピナー（ボタン内の「生成中...」表示等）を削除しない（両方が併存してよい）
- `useTransition`を使う箇所を`grep`で洗い出さず、記憶に頼った箇所だけに`useGlobalPending`を追加して終わらせない

## 完了条件

- [ ] ブランドスピナー・回転アニメーション実装済み
- [ ] ページ遷移用`loading.tsx`実装済み
- [ ] グローバルローディングオーバーレイ（カウンタ方式）実装済み
- [ ] 既存の`useTransition`使用箇所すべてに組み込み済み（grep確認込み）
- [ ] 動作確認済み
