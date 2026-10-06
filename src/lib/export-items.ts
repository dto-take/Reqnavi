import { fetchAllPages } from "@/lib/paged-select";
import type { createServerActionClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerActionClient>>;

// 出力（Word・PowerPoint・Excel）に含めない項目の状態。不採用（rejected）の項目は、確定判定の集計
// （list_project_chapter_stats）・10章の観点の出力と同じく、出力に含めない。
// 出力のための項目の取得は、必ずこの関数を通す（出力ごとに別々の除外条件を持たない）。
// 1000行を超えても切り捨てないよう、共通のページング（規約62）で取得する。
export const EXPORT_EXCLUDED_STATUS = "rejected";

export function fetchExportItems<T>(
  supabase: Supabase,
  projectId: string,
  chapterNo: number,
  select: string,
  order: "order_index" | "id" = "order_index"
): Promise<T[]> {
  return fetchAllPages<T>((from, to) => {
    const base = supabase
      .from("requirement_items")
      .select(select)
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo)
      .neq("status", EXPORT_EXCLUDED_STATUS);
    const ordered = order === "order_index" ? base.order("order_index").order("id") : base.order("id");
    return ordered.range(from, to);
  });
}
