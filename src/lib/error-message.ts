// Supabase（PostgREST/Auth/Storage）のエラーはネイティブのErrorを継承しないプレーンオブジェクト
// （message/details/hint/code等）で返ってくることがあるため、instanceof Errorだけでは
// メッセージを取り出せず「エラーが発生しました」という汎用文言に潰れてしまう。
// また、これらは英語のメッセージなので、既知のものは日本語に変換し、未知の英語はそのまま見せない。
export const GENERIC_ERROR_JA = "処理に失敗しました。時間をおいて、もう一度お試しください。";
const PERMISSION_ERROR_JA = "この操作を行う権限がありません";
const NETWORK_ERROR_JA = "通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。";

const NETWORK_ERROR_MESSAGES = new Set([
  "failed to fetch", // Chrome系
  "load failed", // Safari
  "networkerror when attempting to fetch resource.", // Firefox
]);

// 既知の英語メッセージの対応表（上から順に評価する）
const KNOWN_PATTERNS: [RegExp, string][] = [
  [/row-level security|permission denied/i, PERMISSION_ERROR_JA],
  [/object not found/i, "ファイルが見つかりません"],
  [/bucket not found/i, "ファイルの保存先が見つかりません"],
  [/the resource already exists/i, "同じ名前のファイルが既に存在します"],
  [/duplicate key value violates unique constraint/i, "既に登録されています"],
  [/payload too large|exceeded the maximum allowed size|file size/i, "ファイルサイズが上限を超えています"],
  [/violates foreign key constraint/i, "他のデータから参照されているため、操作できません"],
  [/violates check constraint/i, "入力内容が正しくありません"],
  [/null value in column|violates not-null constraint/i, "必須項目が入力されていません"],
  [/invalid input syntax for type uuid/i, "指定された対象が正しくありません"],
  [/cannot coerce the result to a single json object|the result contains 0 rows/i, "対象が見つかりません"],
  [/jwt expired|invalid jwt|auth session missing/i, "ログインの有効期限が切れました。再度ログインしてください"],
  [/an error occurred in the server components render/i, GENERIC_ERROR_JA],
];

const HAS_JAPANESE = /[぀-ヿ一-鿿]/;

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "エラーが発生しました";
}

// 既知の英語メッセージ（対応表・通信エラー）なら日本語を返す。該当しなければnull
export function knownErrorMessage(e: unknown): string | null {
  const message = rawMessage(e);
  // fetchが通信自体に失敗したときのブラウザ固有の英語メッセージ（完全一致のみ）
  if (NETWORK_ERROR_MESSAGES.has(message.trim().toLowerCase())) return NETWORK_ERROR_JA;
  for (const [pattern, ja] of KNOWN_PATTERNS) if (pattern.test(message)) return ja;
  return null;
}

// 利用者に見せる文言。日本語のメッセージ（UserFacingError等）はそのまま、既知の英語は日本語に、
// 対応表に無い英語は見せずに汎用文言にする（元のメッセージはサーバーログ／コンソールに残す）。
export function errorMessage(e: unknown): string {
  const message = rawMessage(e);
  const known = knownErrorMessage(e);
  if (known) return known;
  if (HAS_JAPANESE.test(message)) return message;
  console.error("[errorMessage] 未知の英語メッセージを汎用文言に置き換えました:", message);
  return GENERIC_ERROR_JA;
}
