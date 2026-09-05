"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useGlobalPending } from "@/components/ui/loading-overlay";

const MESSAGES = ["資料を読み込んでいます...", "AIが内容を分析中...", "項目を整理しています...", "もうすぐ完了します..."];

// 成功トーストはAiGenerateForm側（useActionStateの結果を見て成功時のみ表示）が担当する。
// ここでpending true→falseだけを見ると、失敗時にも「生成しました」と出てしまうため持たない。
export function AiGenerateButton() {
  const { pending } = useFormStatus();
  useGlobalPending(pending);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => setMessageIndex((i) => (i + 1) % MESSAGES.length), 2500);
    return () => {
      clearInterval(interval);
      setMessageIndex(0);
    };
  }, [pending]);

  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
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
