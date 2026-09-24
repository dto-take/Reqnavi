import { createServerActionClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createServerActionClient>>;

// KPI画面フェーズ3（kpi-tree.tsのsuggestKpiCandidates）で最初に実装した「他章の確定済み
// 内容を参考文脈としてAIへ渡す」ロジック。nonfunctional_ux_phase3.mdの指示（「他章の確定済み
// 内容を取得するロジックを、KPIの実装と重複して作らない」）に従い、両方から使える共通関数へ
// 切り出す。本文列の優先順位はfix_card_body_field.mdのpickBodyColumnKeyと同じ考え方
// （内容のある列を優先）に揃えている。
export async function fetchOtherChapterConfirmedContext(
  supabase: SupabaseClient,
  projectId: string,
  excludeChapterNo: number,
  limit = 10
): Promise<string> {
  const { data } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("status", "confirmed")
    .neq("chapter_no", excludeChapterNo)
    .limit(limit);
  return ((data ?? []) as { content: Record<string, string> }[])
    .map((i) => i.content.detail ?? i.content.issue ?? i.content.why ?? "")
    .filter(Boolean)
    .join("\n");
}
