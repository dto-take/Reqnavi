export class AiCallError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "AiCallError";
  }
}

// 503（モデル過負荷。Google側で"high demand"時に返す）は一時的なエラーのため、
// 1回だけ再試行する。429（利用上限）はGoogle側で失敗したリトライも
// クォータに数えられる場合があるため、ここではリトライ対象にしない（案内文を出すのみ）。
// リトライ回数は無料枠のRPM（1分あたりのリクエスト数）制限を圧迫しないよう最小限に留めている
// （1操作あたりGemini呼び出しが最大3回→2回になるよう、再試行は1回のみ）。
const RETRY_DELAYS_MS = [2000];

function isRetryableUnavailable(message: string): boolean {
  return message.includes("503") || message.includes("UNAVAILABLE");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini API呼び出しをラップし、エラー内容を利用者向けの文言に変換する
export async function callGeminiSafely<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isLastAttempt = attempt === maxAttempts - 1;

      if (isRetryableUnavailable(message) && !isLastAttempt) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || message.includes("quota")) {
        throw new AiCallError(
          "AI機能の利用上限に達しています。しばらく時間を置いてから再度お試しください。",
          err
        );
      }
      if (message.includes("401") || message.includes("403") || message.includes("API_KEY_INVALID")) {
        throw new AiCallError("AI機能の認証に失敗しました。管理者に確認してください。", err);
      }
      // 404/NOT_FOUNDはモデル自体が廃止・利用不可になっている場合に返る（実際に
      // gemini-2.5-flashで"no longer available to new users"というメッセージ付きで発生した）。
      // 一時的な過負荷ではなくモデル設定の問題のため、リトライしても解決しない。
      if (message.includes("404") || message.includes("NOT_FOUND")) {
        throw new AiCallError(
          "AI機能で使用しているモデルが利用できない状態です。管理者にご連絡ください。",
          err
        );
      }
      if (isRetryableUnavailable(message)) {
        throw new AiCallError(
          "Geminiが混雑しているため、複数回再試行しましたが失敗しました。しばらく時間を置いて再度お試しください。",
          err
        );
      }
      throw new AiCallError("AI機能の呼び出し中にエラーが発生しました。時間を置いて再度お試しください。", err);
    }
  }

  // 上のfor文は必ずreturn/throwで終わるが、TypeScriptはループ内制御フローだけでは
  // 戻り値を保証できないと判断するため、到達しないフォールバックを明示しておく
  throw new AiCallError("AI機能の呼び出し中にエラーが発生しました。時間を置いて再度お試しください。");
}
