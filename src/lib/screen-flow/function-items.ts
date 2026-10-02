import { hasScreenInfo, type FunctionItem } from "@/lib/screen-flow/derive";

type Item = { id: string; status: string; content: Record<string, string | null | undefined> };

// 9章の画面情報を持つ項目。F-NNは9章項目に固有の番号が無いため、画面情報を持つ項目の並び順
// から導出した表示用の番号。ページ表示とAI提案（参照名F-NN→実idの変換）で同じ採番を共有する。
export function buildFunctionItems(items: Item[]): FunctionItem[] {
  return items
    .filter((i) => hasScreenInfo(i.content))
    .map((i, idx) => ({
      id: i.id,
      name: i.content.name ?? "(名称未設定)",
      status: i.status,
      hasScreen: true,
      code: `F-${String(idx + 1).padStart(2, "0")}`,
      pattern: i.content.screen_pattern ?? "",
      fields: (i.content.screen_fields ?? "").split(",").map((f) => f.trim()).filter(Boolean),
      actions: (i.content.screen_actions ?? "").split(",").map((a) => a.trim()).filter(Boolean),
    }));
}
