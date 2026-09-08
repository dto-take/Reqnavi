# 指示書：Word/PowerPoint出力ボタンのローディング表示

## 目的

「Wordで出力」「PowerPointで出力」ボタンに、生成中であることを示すローディング表示（「生成中...」等）を追加する。現状はただの`<a href={...}>`によるファイルダウンロードのため、クリック後の待ち時間にReactが状態を検知できず、何も表示されない。

## 方針

`fetch()`でファイルを取得し、取得完了後にブラウザのダウンロードとして扱う形に変更することで、取得中の状態をReactの`useState`で管理できるようにする。

## 前提確認

- 画面遷移図のAI素案生成・画面設計書Excel出力・出力リンクの復元が完了していること

---

## Step 1: ダウンロード用の共通コンポーネントを作成

新規ファイル `src/components/ui/download-button.tsx`。

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

export function DownloadButton({
  href,
  fallbackFileName,
  pendingText = "生成中...",
  children,
}: {
  href: string;
  fallbackFileName: string;
  pendingText?: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const { show } = useToast();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error("ダウンロードに失敗しました");
      const blob = await res.blob();

      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = match ? decodeURIComponent(match[1]) : fallbackFileName;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      show(errorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" disabled={loading} onClick={handleClick}>
      {loading ? (
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

**注意**：`Content-Disposition`ヘッダのパース（`filename*=UTF-8''...`形式）は、既存のWord/PowerPoint/Excel出力側の実装（規約27）と一致する形式を前提にしている。実際のヘッダ値の形式を確認し、パースが失敗する場合は`fallbackFileName`にフォールバックする現状の実装で問題ないか確認すること。

## Step 2: 既存の出力ボタンを置き換え

`src/app/(app)/projects/[id]/page.tsx`の「Wordで出力」「PowerPointで出力」を、この`DownloadButton`に置き換える。

```tsx
import { DownloadButton } from "@/components/ui/download-button";

<div className="flex gap-2 mt-3">
  <DownloadButton href={`/api/projects/${id}/export`} fallbackFileName="export.docx" pendingText="Word生成中...">
    Wordで出力
  </DownloadButton>
  <DownloadButton href={`/api/projects/${id}/export-pptx`} fallbackFileName="export.pptx" pendingText="PowerPoint生成中...">
    PowerPointで出力（サマリー）
  </DownloadButton>
</div>
```

同様に、画面設計書Excel出力（「画面イメージ」ページ）のリンクも`DownloadButton`に置き換える。

## Step 3: 動作確認

1. 「Wordで出力」をクリックし、生成中は「Word生成中...」の表示に変わり、完了後にファイルがダウンロードされることを確認する
2. PowerPoint・Excel出力でも同様に確認する
3. 生成中にボタンが無効化され、連打できないことを確認する
4. わざとエラーを起こす状況を作り、トースト通知でエラーが表示されることを確認する

## 完了条件

- [ ] `DownloadButton`実装済み
- [ ] Word/PowerPoint/Excel出力ボタンすべてに適用済み
- [ ] 動作確認済み
