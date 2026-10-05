import { unstable_rethrow } from "next/navigation";
import { UserFacingError } from "@/lib/user-error";
import { AiCallError } from "@/lib/ai/gemini-error";
import { GENERIC_ERROR_JA, knownErrorMessage } from "@/lib/error-message";

// 本番ビルドでは、Server Actionがthrowした例外のメッセージは利用者に届く前に消える
// （form actionは汎用エラー画面、クライアントのtry/catchは英語の長文になる）。
// 利用者に理由を見せる失敗は、throwせず戻り値で返す。開発と本番で挙動を変えない。
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

// useActionState（規約50）の形。
export type FormActionState = { error: string | null };

// fnがthrowした例外を結果に変換する。
//  ・UserFacingError・AiCallError（Geminiの利用枠超過・キー無効等。文言は日本語で用意済み）→ その文言
//  ・redirect()・notFound()等のNext.jsの制御用の例外 → 必ず再throw（握りつぶすとリダイレクトが壊れる）
//  ・それ以外 → サーバーログに記録し、既知の英語メッセージは日本語に、未知なら汎用文言
export async function safeAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserFacingError || e instanceof AiCallError) return { ok: false, error: e.message };
    const raw = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : JSON.stringify(e);
    console.error(`[action:${name}] unexpected error: ${raw}`);
    return { ok: false, error: knownErrorMessage(e) ?? GENERIC_ERROR_JA };
  }
}

// <form action>用（useActionStateの形）。成功時のredirect()はそのままfn内で呼んでよい。
export async function safeFormAction(name: string, fn: () => Promise<void>): Promise<FormActionState> {
  const r = await safeAction(name, fn);
  return r.ok ? { error: null } : { error: r.error };
}
