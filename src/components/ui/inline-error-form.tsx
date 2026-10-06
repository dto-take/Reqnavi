"use client";

import { useEffect, useRef } from "react";
import { useSafeActionState } from "@/lib/use-safe-action-state";
import { useToast } from "@/components/ui/toast";

type ActionResult = { error: string | null };

// Next.js 16では、Server Actionからthrowしたエラーはerror.tsxに到達する際に
// サーバー側のmessageが失われ常に汎用文言に置き換わる（実機で確認済み）。
// このため意図したエラーはthrowせず戻り値で返し、ここでuseActionStateで受け取って
// インライン表示する（成功時はsuccessMessageが指定されていればトーストを出す）。
export function InlineErrorForm({
  action,
  children,
  className,
  successMessage,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
}) {
  // 通信断（Actionの呼び出し自体の例外）は、useSafeActionStateが{error: 日本語}に変換する
  const [state, formAction] = useSafeActionState(action);
  const { show } = useToast();
  const hasSubmitted = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);

  useEffect(() => {
    if (!hasSubmitted.current) {
      hasSubmitted.current = true;
      return;
    }
    if (!state.error && successMessage) {
      show(successMessage);
    }
    // 失敗時は、リセットされた入力欄に、送信した値を戻す（入力した内容を消さない）
    if (state.error && formRef.current && submitted.current) {
      for (const [name, value] of submitted.current.entries()) {
        const el = formRef.current.elements.namedItem(name);
        if (typeof value === "string" && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.type !== "hidden") el.value = value;
      }
    }
  }, [state, successMessage, show]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        submitted.current = new FormData(e.currentTarget);
      }}
      className={className}
    >
      {children}
      {state.error && <p role="alert" data-form-error className="text-xs text-[#A23B2E] mt-1 col-span-full">{state.error}</p>}
    </form>
  );
}
