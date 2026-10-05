import { errorMessage } from "@/lib/error-message";
import type { ActionResult } from "@/lib/action-result";

type Show = (message: string, kind?: "success" | "error") => void;

// クライアントからServer Action（ActionResultを返すもの）を呼ぶ共通の書き方。
// ・{ok:false}はトーストでerrorを表示（サーバーの文言）
// ・通信エラー等、クライアントで発生した例外はtry/catchでerrorMessage()により日本語化（規約43・44）
// 成功時は結果を返し、失敗時（トースト表示済み）はnullを返す。
export async function runAction<T>(fn: () => Promise<ActionResult<T>>, show: Show): Promise<{ data: T } | null> {
  try {
    const r = await fn();
    if (!r.ok) {
      show(r.error, "error");
      return null;
    }
    return { data: r.data };
  } catch (e) {
    show(errorMessage(e), "error");
    return null;
  }
}
