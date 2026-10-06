"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { networkErrorMessage } from "@/lib/error-message";

export default function ProjectErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isAiError = error.name === "AiCallError";
  // 通信エラー（Failed to fetch等）のときは、原因を日本語で表示する
  const network = networkErrorMessage(error);

  return (
    <Card className="max-w-md mx-auto mt-20 text-center">
      <div className="text-sm font-medium text-primary mb-2">
        {isAiError ? "AI機能でエラーが発生しました" : "エラーが発生しました"}
      </div>
      <p className="text-sm text-secondary mb-4">
        {isAiError ? error.message : (network ?? "予期しないエラーが発生しました。しばらく時間を置いて再度お試しください。")}
      </p>
      <Button type="button" variant="primary" size="md" onClick={reset}>
        再試行
      </Button>
      {error.digest && <p data-error-id className="mt-3 text-[10px] text-faint">エラーID：{error.digest}</p>}
    </Card>
  );
}
