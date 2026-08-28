"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";

export type ChapterReadiness = {
  chapterNo: number;
  templateType: string;
  totalItems: number;
  confirmedItems: number;
  readinessRate: number;
  ambiguousCount: number;
  needHearingCount: number;
  exceptionApprovedCount: number;
};

type ItemRow = {
  content: Record<string, string | null>;
  status: string;
  ambiguous_flags: unknown[] | null;
};

type ColumnRow = { column_key: string; applicable_chapters: number[] | null };

export async function getReadinessSummary(projectId: string): Promise<ChapterReadiness[]> {
  const supabase = await createServerActionClient();

  const { data: projectData } = await supabase
    .from("projects")
    .select("selected_chapters")
    .eq("id", projectId)
    .single();
  const project = projectData as unknown as { selected_chapters: number[] } | null;
  const selectedChapters = project?.selected_chapters ?? [];

  const targetChapters = selectedChapters.filter((c) => CHAPTER_TEMPLATE_MAP[c]);
  const results: ChapterReadiness[] = [];

  for (const chapterNo of targetChapters) {
    const templateType = CHAPTER_TEMPLATE_MAP[chapterNo];

    const { data: itemsData, error } = await supabase
      .from("requirement_items")
      .select("content, status, ambiguous_flags")
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo);
    if (error) throw error;
    const items = itemsData as unknown as ItemRow[];

    const { data: columnsData } = await supabase
      .from("chapter_column_templates")
      .select("column_key, applicable_chapters")
      .eq("template_type", templateType);
    const columns = columnsData as unknown as ColumnRow[] | null;
    const columnKeys = (columns ?? [])
      .filter((c) => c.applicable_chapters === null || c.applicable_chapters.includes(chapterNo))
      .map((c) => c.column_key);

    // 不採用項目は充足率・要ヒアリング件数等、すべての集計から除外する（対応不要と判断済みのため）
    const activeItems = items?.filter((i) => i.status !== "rejected") ?? [];

    const totalItems = activeItems.length;
    const confirmedItems = activeItems.filter((i) => i.status === "confirmed" || i.status === "exception_approved").length;
    const exceptionApprovedCount = activeItems.filter((i) => i.status === "exception_approved").length;
    const ambiguousCount = activeItems.reduce((sum, i) => sum + (i.ambiguous_flags?.length ?? 0), 0);
    const needHearingCount = activeItems.filter((i) =>
      columnKeys.some((key) => !i.content?.[key] || i.content[key]!.trim() === "")
    ).length;

    results.push({
      chapterNo,
      templateType,
      totalItems,
      confirmedItems,
      readinessRate: totalItems > 0 ? Math.round((confirmedItems / totalItems) * 100) : 0,
      ambiguousCount,
      needHearingCount,
      exceptionApprovedCount,
    });
  }

  return results;
}

// D（4章KPI）・E（10章非機能要件）・ガント（15章進捗）はgetReadinessSummaryの対象外
// （充足率という概念に馴染まないテンプレートのため）。このため別途、
// 「未着手/進行中」の2段階のみの簡易判定を用意する（規約：確定の概念を無理に統一しない）。
export async function getSimpleChapterStatuses(projectId: string): Promise<Record<number, "not_started" | "in_progress">> {
  const supabase = await createServerActionClient();
  const results: Record<number, "not_started" | "in_progress"> = {};

  const { count: kpiCount } = await supabase.from("requirement_items").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("chapter_no", 4);
  results[4] = (kpiCount ?? 0) > 0 ? "in_progress" : "not_started";

  const { count: nonFuncCount } = await supabase.from("requirement_items").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("chapter_no", 10);
  results[10] = (nonFuncCount ?? 0) > 0 ? "in_progress" : "not_started";

  const { count: progressCount } = await supabase.from("progress_tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  results[15] = (progressCount ?? 0) > 0 ? "in_progress" : "not_started";

  return results;
}
