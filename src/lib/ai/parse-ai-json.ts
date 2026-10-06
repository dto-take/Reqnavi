import { AiCallError } from "@/lib/ai/gemini-error";

// AIの出力が、期待した形式（JSON）として読めなかったときの、利用者向けの文言。
// 形式は読めたが、決められた構造に合わなかった（Zodの検証に失敗）場合にも、同じ文言を使う。
export const AI_OUTPUT_FORMAT_ERROR = "AIの出力形式が不正でした。もう一度お試しください。";

// AIの出力テキストをJSONとして読む。コードブロック記号（```json）は取り除く。
// 読めなかったときは、JSON.parseのSyntaxError（利用者には汎用の文言になってしまう）ではなく、
// AI呼び出しの失敗（AiCallError）として、日本語の文言で投げる。
export function parseAiJson(text: string | undefined): unknown {
  const cleaned = (text ?? "{}").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new AiCallError(AI_OUTPUT_FORMAT_ERROR, e);
  }
}
