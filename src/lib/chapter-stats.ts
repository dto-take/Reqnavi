// 確定判定の章別集計の、TS側の共通ロジック（DB非依存の純粋関数）。
// 総数・確定数そのものはDBの集計関数 list_project_chapter_stats()（1か所）が定義する。
// ここは、その結果から「章の状態」「充足率」を導く定義を1つに集約する。
// 確定判定ダッシュボード・サイドバー・案件トップ・案件一覧は、すべてこの関数を共用する。
import { CHAPTER_NAMES } from "./chapters";
import type { ChapterStatus } from "./chapter-status";

// 確定の概念を持たない章（進捗。計画の定義に特化している）
export const PROGRESS_CHAPTER_NO = 15;

export type ChapterStat = {
  chapterNo: number;
  totalItems: number; // 章ごとの「数える単位」の総数（不採用を除く。単位はSQL関数のコメント参照）
  confirmedItems: number;
  exceptionItems: number; // 例外承認の件数（A/B/C章のみ）
  updatedAt: string | null;
  updatedBy: string | null;
};

// 確定できる章（15章を除く）
export function isConfirmableChapter(chapterNo: number): boolean {
  return chapterNo !== PROGRESS_CHAPTER_NO && !!CHAPTER_NAMES[chapterNo];
}

// 章の状態（全章共通）：総数0＝未着手／確定数＝総数＝確定／それ以外＝進行中。
// 15章だけは確定が無く、総数（工程の件数）が1件以上なら進行中の2段階。
export function chapterStatusOf(chapterNo: number, stat: ChapterStat | undefined): ChapterStatus {
  if (!stat || stat.totalItems === 0) return "not_started";
  if (chapterNo === PROGRESS_CHAPTER_NO) return "in_progress";
  return stat.confirmedItems >= stat.totalItems ? "confirmed" : "in_progress";
}

export type ChapterRate = {
  chapterNo: number;
  totalItems: number;
  confirmedItems: number;
  readinessRate: number; // 確定数／総数（四捨五入）。総数0は0
  exceptionApprovedCount: number;
  status: ChapterStatus;
};

export function rateOf(stat: Pick<ChapterStat, "totalItems" | "confirmedItems">): number {
  return stat.totalItems > 0 ? Math.round((stat.confirmedItems / stat.totalItems) * 100) : 0;
}

// 案件の対象章（selected_chapters）のうち、確定できる章の充足率（章番号の昇順）
export function chapterRates(selectedChapters: number[], stats: ChapterStat[]): ChapterRate[] {
  const byChapter = new Map(stats.map((s) => [s.chapterNo, s]));
  return [...new Set(selectedChapters)]
    .filter(isConfirmableChapter)
    .sort((a, b) => a - b)
    .map((n) => {
      const s = byChapter.get(n);
      return {
        chapterNo: n,
        totalItems: s?.totalItems ?? 0,
        confirmedItems: s?.confirmedItems ?? 0,
        readinessRate: s ? rateOf(s) : 0,
        exceptionApprovedCount: s?.exceptionItems ?? 0,
        status: chapterStatusOf(n, s),
      };
    });
}

// 案件全体の「確定率」：確定項目数 ÷ 総項目数。案件トップのヘッダー・サイドバー・案件一覧・
// PowerPointの概要スライド・ベースラインが共用する唯一の定義。総数は不採用を除き、10章はチェック項目行を
// 数えない（list_project_chapter_stats の定義どおり）。対象は案件の対象章のうち確定できる章（15章を除く）。
// 章ごとの充足率の平均は、案件全体の指標としては使わない（章の件数の偏りで値が食い違うため）。
export type OverallRate = { total: number; confirmed: number; rate: number; fraction: number };

export function overallRate(selectedChapters: number[], stats: ChapterStat[]): OverallRate {
  const byChapter = new Map(stats.map((s) => [s.chapterNo, s]));
  let total = 0;
  let confirmed = 0;
  for (const n of new Set(selectedChapters)) {
    if (!isConfirmableChapter(n)) continue;
    const s = byChapter.get(n);
    if (!s) continue;
    total += s.totalItems;
    confirmed += s.confirmedItems;
  }
  return fromTotals(total, confirmed);
}

export function fromTotals(total: number, confirmed: number): OverallRate {
  return { total, confirmed, rate: total > 0 ? Math.round((confirmed / total) * 100) : 0, fraction: total > 0 ? confirmed / total : 0 };
}

// 章ごとに全対象章の状態（15章を含む）
export function chapterStatuses(selectedChapters: number[], stats: ChapterStat[]): Record<number, ChapterStatus> {
  const byChapter = new Map(stats.map((s) => [s.chapterNo, s]));
  const result: Record<number, ChapterStatus> = {};
  for (const n of selectedChapters) if (CHAPTER_NAMES[n]) result[n] = chapterStatusOf(n, byChapter.get(n));
  return result;
}

// 数える単位が「項目」ではない章の説明（ダッシュボードに小さく添える）
export const CHAPTER_UNIT_NOTE: Record<number, string> = {
  4: "KPIノード単位",
  10: "採用中の観点単位（チェック項目は含みません）",
};

// 曖昧表現・要ヒアリングの対象外の章（ダッシュボードでは「—」）
export function hasAmbiguityDetail(chapterNo: number): boolean {
  return chapterNo !== 4 && chapterNo !== 10;
}
