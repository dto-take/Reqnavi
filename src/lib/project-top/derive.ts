// project_top_ux.md Step1：案件トップの派生ロジック（DB非依存の純粋関数）。
// 章ごとの総数・確定数・状態は、確定判定の集計（list_project_chapter_stats／chapter-stats.ts）をそのまま使い、
// ここでは数え直さない。
import { CHAPTER_GROUPS, CHAPTER_NAMES } from "../chapters";
import type { ChapterStatus } from "../chapter-status";
import { PROGRESS_CHAPTER_NO, chapterStatusOf, isConfirmableChapter, type ChapterStat } from "../chapter-stats";

export type ChapterCardData = {
  chapterNo: number;
  name: string;
  status: ChapterStatus;
  total: number; // 15章は工程の件数
  confirmed: number;
  ambiguousCount: number | null; // 4・10・15章は曖昧表現の概念が無い（null）
  updatedAt: string | null;
  updatedBy: string | null;
  isProgress: boolean; // 15章（確定の概念が無い）
  unitLabel: string; // 件／観点／工程
};

export function buildChapterCards(
  selectedChapters: number[],
  stats: ChapterStat[],
  ambiguous: Record<number, number>,
  userNames: Record<string, string> = {}
): ChapterCardData[] {
  const byChapter = new Map(stats.map((s) => [s.chapterNo, s]));
  return [...new Set(selectedChapters)]
    .filter((n) => !!CHAPTER_NAMES[n])
    .sort((a, b) => a - b)
    .map((n) => {
      const s = byChapter.get(n);
      return {
        chapterNo: n,
        name: CHAPTER_NAMES[n],
        status: chapterStatusOf(n, s),
        total: s?.totalItems ?? 0,
        confirmed: n === PROGRESS_CHAPTER_NO ? 0 : (s?.confirmedItems ?? 0),
        ambiguousCount: n in ambiguous ? ambiguous[n] : null,
        updatedAt: s?.updatedAt ?? null,
        updatedBy: s?.updatedBy ? (userNames[s.updatedBy] ?? null) : null,
        isProgress: n === PROGRESS_CHAPTER_NO,
        unitLabel: n === PROGRESS_CHAPTER_NO ? "工程" : n === 10 ? "観点" : "件",
      };
    });
}

// 「次にやる章」 ---------------------------------------------------------

export type NextChapter =
  | { kind: "continue"; chapterNo: number }
  | { kind: "start"; chapterNo: number }
  | { kind: "all_confirmed"; baseline: boolean };

// 1. 対象：15章を除く、状態が「作成中」（項目があり、全項目が確定ではない。AI素案だけで1件も確定していない章も含む）
// 2. 複数あれば ①曖昧表現がある章を優先 ②同条件なら最終編集が新しい章（同時刻は章番号が小さい方）
// 3. 作成中が無ければ、最初の未着手章（章番号順）
// 4. どちらも無ければ、すべて確定（ベースライン未確定か確定済みかを区別して返す）
export function decideNextChapter(cards: ChapterCardData[], hasBaseline: boolean): NextChapter {
  const confirmable = cards.filter((c) => isConfirmableChapter(c.chapterNo));
  const working = confirmable.filter((c) => c.status === "in_progress");
  if (working.length > 0) {
    const sorted = [...working].sort((a, b) => {
      const aa = (a.ambiguousCount ?? 0) > 0 ? 1 : 0;
      const ba = (b.ambiguousCount ?? 0) > 0 ? 1 : 0;
      if (aa !== ba) return ba - aa;
      if (a.updatedAt !== b.updatedAt) {
        if (a.updatedAt === null) return 1;
        if (b.updatedAt === null) return -1;
        return a.updatedAt > b.updatedAt ? -1 : 1;
      }
      return a.chapterNo - b.chapterNo;
    });
    return { kind: "continue", chapterNo: sorted[0].chapterNo };
  }
  const notStarted = confirmable.filter((c) => c.status === "not_started").sort((a, b) => a.chapterNo - b.chapterNo);
  if (notStarted.length > 0) return { kind: "start", chapterNo: notStarted[0].chapterNo };
  return { kind: "all_confirmed", baseline: hasBaseline };
}

// 進捗セグメント -----------------------------------------------------------

export type SegmentColor = "confirmed" | "in_progress" | "not_started";

// セグメント数は min(6, 総数)（総数0は6本の灰）。確定の割合に応じて緑を塗る。
// 確定が1件以上なら緑は最低1本、未確定が残るなら緑は最大でn−1本（作成中の章が「完了」や「空」に見えないように）。
// 確定済みの章は全て緑。残りは、項目がある章なら琥珀、未着手なら灰。15章は確定が無く、工程があれば全て琥珀。
export function segmentsFor(card: Pick<ChapterCardData, "total" | "confirmed" | "status" | "isProgress">): SegmentColor[] {
  const n = card.total === 0 ? 6 : Math.min(6, card.total);
  if (card.total === 0) return Array.from({ length: n }, () => "not_started" as const);
  if (card.isProgress) return Array.from({ length: n }, () => "in_progress" as const);
  let greens = 0;
  if (card.confirmed >= card.total) greens = n;
  else if (card.confirmed > 0) greens = Math.min(n - 1, Math.max(1, Math.round((card.confirmed / card.total) * n)));
  return Array.from({ length: n }, (_, i) => (i < greens ? "confirmed" : "in_progress"));
}

// フィルタ ---------------------------------------------------------------

export type ChapterFilter = "all" | "unconfirmed" | "ambiguous";

// 件数は、フィルタとは独立した全章に対する件数。「未確定あり」＝確定済み以外の章（15章を除く）
export function filterCounts(cards: ChapterCardData[]): Record<ChapterFilter, number> {
  return {
    all: cards.length,
    unconfirmed: cards.filter((c) => isConfirmableChapter(c.chapterNo) && c.status !== "confirmed").length,
    ambiguous: cards.filter((c) => (c.ambiguousCount ?? 0) > 0).length,
  };
}

export function applyFilter(cards: ChapterCardData[], filter: ChapterFilter): ChapterCardData[] {
  if (filter === "unconfirmed") return cards.filter((c) => isConfirmableChapter(c.chapterNo) && c.status !== "confirmed");
  if (filter === "ambiguous") return cards.filter((c) => (c.ambiguousCount ?? 0) > 0);
  return cards;
}

// フェーズ ---------------------------------------------------------------

export type Phase = {
  label: string;
  cards: ChapterCardData[]; // フィルタ後
  confirmedChapters: number; // 確定可能な章（15章を除く）のうち確定済みの数（フィルタに依らない）
  confirmableChapters: number;
  progressFraction: number; // フェーズ内の確定項目／総項目（確定可能な章のみ。フィルタに依らない）
  progressOnly: boolean; // 15章だけのフェーズ（確定の対象外）
};

// フェーズ分けは既存のステップ一覧の4グループ。対象章に含まれない章は出さず、フィルタ後に章が0件のフェーズは返さない。
export function buildPhases(cards: ChapterCardData[], filter: ChapterFilter): Phase[] {
  const filtered = new Set(applyFilter(cards, filter).map((c) => c.chapterNo));
  const phases: Phase[] = [];
  for (const g of CHAPTER_GROUPS) {
    const all = cards.filter((c) => g.chapters.includes(c.chapterNo));
    const shown = all.filter((c) => filtered.has(c.chapterNo));
    if (shown.length === 0) continue;
    const confirmable = all.filter((c) => isConfirmableChapter(c.chapterNo));
    const total = confirmable.reduce((s, c) => s + c.total, 0);
    const confirmed = confirmable.reduce((s, c) => s + c.confirmed, 0);
    phases.push({
      label: g.label,
      cards: shown,
      confirmedChapters: confirmable.filter((c) => c.status === "confirmed").length,
      confirmableChapters: confirmable.length,
      progressFraction: total > 0 ? confirmed / total : 0,
      progressOnly: confirmable.length === 0,
    });
  }
  return phases;
}

// 最近の動き ---------------------------------------------------------------

export type ActivityKind = "confirmed" | "ai" | "edit";

// 種別：確定済み→「確定」、AI素案のまま人の手が入っていない（ai_draft）→「AI」、それ以外→「編集」
export function activityKind(status: string): ActivityKind {
  if (status === "confirmed") return "confirmed";
  if (status === "ai_draft") return "ai";
  return "edit";
}
