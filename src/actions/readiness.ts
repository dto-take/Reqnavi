"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";
import type { ChapterStatus } from "@/lib/chapter-status";
import { fetchAllPages } from "@/lib/paged-select";
import { getHiddenChapterNos } from "@/lib/hidden-chapters";
import {
  overallRate,
  chapterRates,
  chapterStatuses,
  hasAmbiguityDetail,
  type ChapterRate,
  type ChapterStat,
  type OverallRate,
} from "@/lib/chapter-stats";

export type ChapterReadiness = {
  chapterNo: number;
  templateType: string;
  totalItems: number;
  confirmedItems: number;
  readinessRate: number;
  // 曖昧表現・要ヒアリングは4章・10章の対象外（null）
  ambiguousCount: number | null;
  needHearingCount: number | null;
  exceptionApprovedCount: number;
};

type StatRow = {
  chapter_no: number;
  total_items: number;
  confirmed_items: number;
  exception_items: number;
  last_updated_at: string | null;
  last_updated_by: string | null;
};

// 確定判定の「総数・確定数」は、DBの集計関数 list_project_chapter_stats()（1か所）から得る。
// 項目の行を取得してTS側で数えると、PostgRESTの既定上限（1000行）で黙って切り捨てられる。
export async function getChapterStats(projectId: string): Promise<ChapterStat[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase.rpc("list_project_chapter_stats", { p_project_id: projectId });
  if (error) throw error;
  return ((data ?? []) as unknown as StatRow[]).map((r) => ({
    chapterNo: r.chapter_no,
    totalItems: Number(r.total_items),
    confirmedItems: Number(r.confirmed_items),
    exceptionItems: Number(r.exception_items),
    updatedAt: r.last_updated_at,
    updatedBy: r.last_updated_by,
  }));
}

async function getSelectedChapters(projectId: string): Promise<number[]> {
  const supabase = await createServerActionClient();
  const { data } = await supabase.from("projects").select("selected_chapters").eq("id", projectId).single();
  return (data as unknown as { selected_chapters: number[] } | null)?.selected_chapters ?? [];
}

// サイドバー・案件トップ用の軽量な進捗（確定数・総数のみ。曖昧表現等の詳細は取得しない）。
// 全対象章の状態（15章を含む）、確定できる章の充足率、案件全体の確定率（確定項目数 ÷ 総項目数）を返す。
export async function getProjectProgress(projectId: string): Promise<{
  rates: ChapterRate[];
  statuses: Record<number, ChapterStatus>;
  overall: OverallRate;
}> {
  const [selectedAll, stats, hidden] = await Promise.all([getSelectedChapters(projectId), getChapterStats(projectId), getHiddenChapterNos()]);
  const selectedChapters = selectedAll.filter((n) => !hidden.includes(n)); // 非公開の章は集計に含めない
  const rates = chapterRates(selectedChapters, stats);
  return { rates, statuses: chapterStatuses(selectedChapters, stats), overall: overallRate(selectedChapters, stats) };
}

type ItemRow = {
  content: Record<string, string | null>;
};
type ColumnRow = { column_key: string; applicable_chapters: number[] | null };

// 曖昧表現の件数（章番号→件数。A/B/C章のみ。不採用の項目は除く）。確定判定ダッシュボード・
// サイドバーの⚠バッジ・案件トップの章カードが、この1つの定義を共用する。
// フラグを持つ項目の行だけを取得する（フラグ無しの大多数は転送しない）。
export async function getAmbiguousCounts(projectId: string, selectedChapters?: number[]): Promise<Record<number, number>> {
  const supabase = await createServerActionClient();
  const chapters = (selectedChapters ?? (await getSelectedChapters(projectId))).filter((c) => CHAPTER_TEMPLATE_MAP[c]);
  const counts: Record<number, number> = {};
  for (const c of chapters) counts[c] = 0;
  if (chapters.length === 0) return counts;
  const rows = await fetchAllPages<{ chapter_no: number; ambiguous_flags: unknown[] | null }>((from, to) =>
    supabase
      .from("requirement_items")
      .select("chapter_no, ambiguous_flags")
      .eq("project_id", projectId)
      .in("chapter_no", chapters)
      .neq("status", "rejected")
      .neq("ambiguous_flags", "[]")
      .order("id")
      .range(from, to)
  );
  for (const r of rows) counts[r.chapter_no] = (counts[r.chapter_no] ?? 0) + (r.ambiguous_flags?.length ?? 0);
  return counts;
}

// 確定判定ダッシュボード用。総数・確定数・例外承認件数は集計関数から、曖昧表現・要ヒアリングの件数は
// A/B/C章の項目の内容から数える（4章・10章は対象外）。
export async function getReadinessSummary(projectId: string): Promise<ChapterReadiness[]> {
  const supabase = await createServerActionClient();
  const [selectedAll, stats, hidden] = await Promise.all([getSelectedChapters(projectId), getChapterStats(projectId), getHiddenChapterNos()]);
  const selectedChapters = selectedAll.filter((n) => !hidden.includes(n)); // 非公開の章は集計に含めない
  const rates = chapterRates(selectedChapters, stats);
  const ambiguousCounts = await getAmbiguousCounts(projectId, selectedChapters);

  const results: ChapterReadiness[] = [];
  for (const r of rates) {
    const base = {
      chapterNo: r.chapterNo,
      totalItems: r.totalItems,
      confirmedItems: r.confirmedItems,
      readinessRate: r.readinessRate,
      exceptionApprovedCount: r.exceptionApprovedCount,
    };
    if (!hasAmbiguityDetail(r.chapterNo)) {
      results.push({ ...base, templateType: r.chapterNo === 4 ? "D" : "E", ambiguousCount: null, needHearingCount: null });
      continue;
    }

    const templateType = CHAPTER_TEMPLATE_MAP[r.chapterNo];
    const { data: columnsData } = await supabase
      .from("chapter_column_templates")
      .select("column_key, applicable_chapters")
      .eq("template_type", templateType);
    const columns = columnsData as unknown as ColumnRow[] | null;
    const columnKeys = (columns ?? [])
      .filter((c) => c.applicable_chapters === null || c.applicable_chapters.includes(r.chapterNo))
      .map((c) => c.column_key);

    // 不採用項目は曖昧表現・要ヒアリング件数から除外する（対応不要と判断済みのため）。1000行を超えても切り捨てないようページングする
    const items = await fetchAllPages<ItemRow>((from, to) =>
      supabase
        .from("requirement_items")
        .select("content")
        .eq("project_id", projectId)
        .eq("chapter_no", r.chapterNo)
        .neq("status", "rejected")
        .order("created_at")
        .order("id")
        .range(from, to)
    );

    results.push({
      ...base,
      templateType,
      ambiguousCount: ambiguousCounts[r.chapterNo] ?? 0,
      needHearingCount: items.filter((i) =>
        columnKeys.some((key) => !i.content?.[key] || i.content[key]!.trim() === "")
      ).length,
    });
  }
  return results;
}
