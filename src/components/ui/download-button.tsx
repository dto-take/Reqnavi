"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// ダウンロード（取得・保存・エラートースト）の共通処理。DownloadButtonと、メニューから起動する
// 案件トップの「出力 ▾」で共用する（重複実装しない）。
export function useFileDownload() {
  const [loading, setLoading] = useState(false);
  const { show } = useToast();

  async function download(href: string, fallbackFileName: string) {
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

  return { loading, download };
}

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
  const { loading, download } = useFileDownload();

  return (
    <Button variant="secondary" size="sm" disabled={loading} onClick={() => download(href, fallbackFileName)}>
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
