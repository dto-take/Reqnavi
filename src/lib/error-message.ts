// Supabase（PostgREST/Auth）のエラーはネイティブのErrorを継承しないプレーンオブジェクト
// （message/details/hint/code等）で返ってくることがあるため、instanceof Errorだけでは
// メッセージを取り出せず「エラーが発生しました」という汎用文言に潰れてしまう。
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "エラーが発生しました";
}
