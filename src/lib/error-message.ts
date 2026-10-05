// Supabase（PostgREST/Auth）のエラーはネイティブのErrorを継承しないプレーンオブジェクト
// （message/details/hint/code等）で返ってくることがあるため、instanceof Errorだけでは
// メッセージを取り出せず「エラーが発生しました」という汎用文言に潰れてしまう。
const NETWORK_ERROR_MESSAGES = new Set([
  "failed to fetch", // Chrome系
  "load failed", // Safari
  "networkerror when attempting to fetch resource.", // Firefox
]);
const PERMISSION_ERROR_JA = "この操作を行う権限がありません";
const NETWORK_ERROR_JA = "通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。";

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "エラーが発生しました";
}

export function errorMessage(e: unknown): string {
  const message = rawMessage(e);
  // RLSで拒否された書き込み（PostgRESTの英語メッセージ）は、権限が無いことを日本語で伝える
  if (/row-level security|permission denied/i.test(message)) return PERMISSION_ERROR_JA;
  // fetchが通信自体に失敗したときのブラウザ固有の英語メッセージ（完全一致のみ）を日本語にする
  return NETWORK_ERROR_MESSAGES.has(message.trim().toLowerCase()) ? NETWORK_ERROR_JA : message;
}
