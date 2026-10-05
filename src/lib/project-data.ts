import { cache } from "react";
import { createServerActionClient } from "@/lib/supabase/server";
import { getAmbiguousCounts, getChapterStats } from "@/actions/readiness";
import { chapterRates, chapterStatuses, overallRate, type ChapterRate, type ChapterStat, type OverallRate } from "@/lib/chapter-stats";
import type { ChapterStatus } from "@/lib/chapter-status";
import { getHiddenChapterNos } from "@/lib/hidden-chapters";

// 案件配下の画面で、サイドバー（layout）とページ本体が同じリクエスト内で同じデータを二重に取得しないよう、
// React.cacheでリクエスト単位に共有する。cache()の関数は"use server"ファイルからはexportできないため、
// ここ（通常のモジュール）に置く。

export type ProjectHeader = {
  id: string;
  name: string;
  selectedChapters: number[];
  customerName: string | null;
  platform: string | null;
};

export const getProjectHeader = cache(async (projectId: string): Promise<ProjectHeader | null> => {
  const supabase = await createServerActionClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, selected_chapters, organizations(name), platform_knowledge_sets(platform_name)")
    .eq("id", projectId)
    .maybeSingle();
  const p = data as unknown as {
    id: string;
    name: string;
    selected_chapters: number[] | null;
    organizations: { name: string } | null;
    platform_knowledge_sets: { platform_name: string } | null;
  } | null;
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    selectedChapters: [...(p.selected_chapters ?? [])].sort((a, b) => a - b),
    customerName: p.organizations?.name ?? null,
    platform: p.platform_knowledge_sets?.platform_name ?? null,
  };
});

// 自分がこの案件のメンバーか。管理者はメンバーでなくても案件を開けるが、集計（RLS・メンバーのみ）は
// 取れないため、集計結果の有無で推測せず、メンバー情報で明示的に判定する。
export const getIsProjectMember = cache(async (projectId: string): Promise<boolean> => {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return false;
  const { count } = await supabase
    .from("project_members")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  return (count ?? 0) > 0;
});

export type ProjectProgressData = {
  stats: ChapterStat[];
  rates: ChapterRate[];
  statuses: Record<number, ChapterStatus>;
  overall: OverallRate; // 案件全体の確定率（確定項目数 ÷ 総項目数）
  ambiguous: Record<number, number>;
  hiddenChapters: number[]; // このロールに非公開の対象章（集計に含めない）
};

// 章ごとの総数・確定数・状態（list_project_chapter_stats）と曖昧表現の件数。
// 定義は確定判定ダッシュボードと同じ（chapter-stats.ts／getAmbiguousCounts）。
export const getProjectProgressData = cache(async (projectId: string): Promise<ProjectProgressData> => {
  const header = await getProjectHeader(projectId);
  const hidden = await getHiddenChapterNos();
  const hiddenChapters = (header?.selectedChapters ?? []).filter((n) => hidden.includes(n));
  const selected = (header?.selectedChapters ?? []).filter((n) => !hidden.includes(n)); // 非公開の章は集計に含めない
  const [stats, ambiguous] = await Promise.all([getChapterStats(projectId), getAmbiguousCounts(projectId, selected)]);
  const rates = chapterRates(selected, stats);
  return { stats, rates, statuses: chapterStatuses(selected, stats), overall: overallRate(selected, stats), ambiguous, hiddenChapters };
});
