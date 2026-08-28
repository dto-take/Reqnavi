"use client";

import { useActionState, useEffect, useRef } from "react";
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
  const [state, formAction] = useActionState(action, { error: null });
  const { show } = useToast();
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (!hasSubmitted.current) {
      hasSubmitted.current = true;
      return;
    }
    if (!state.error && successMessage) {
      show(successMessage);
    }
  }, [state, successMessage, show]);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && <p className="text-xs text-[#A23B2E] mt-1 col-span-full">{state.error}</p>}
    </form>
  );
}
