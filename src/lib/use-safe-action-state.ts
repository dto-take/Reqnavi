"use client";

import { useActionState, useCallback } from "react";
import { errorMessage } from "@/lib/error-message";
import type { FormActionState } from "@/lib/action-result";

// useActionStateに渡すActionを、クライアントで包み、通信断（Failed to fetch等）のような
// クライアントで発生する例外を {error: 日本語} に変換する。
// Server Actionの失敗は、サーバー側のsafeFormActionが戻り値で返す（規約67）。通信断はそれとは別で、
// Actionの呼び出し自体が例外になるため、包まないと、useActionState内で例外が投げられ、
// 章ページ全体が汎用のエラー画面（error.tsx）に置き換わってしまう。
export function useSafeActionState(action: (prevState: FormActionState, formData: FormData) => Promise<FormActionState>) {
  const safe = useCallback(
    async (prevState: FormActionState, formData: FormData): Promise<FormActionState> => {
      try {
        return await action(prevState, formData);
      } catch (e) {
        return { error: errorMessage(e) };
      }
    },
    [action]
  );
  return useActionState(safe, { error: null } as FormActionState);
}
