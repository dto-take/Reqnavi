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
