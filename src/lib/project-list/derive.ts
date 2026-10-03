// project_list_ux.md Step1：案件一覧の派生ロジック（DB非依存の純粋関数）。
// 数え方は確定判定ダッシュボード・サイドバーの章ドットと一本化する（新しい判定基準は作らない）。
import { CHAPTER_NAMES, CHAPTER_TEMPLATE_MAP } from "../chapters";
import { chapterStatusFromReadiness, type ChapterStatus } from "../chapter-status";

// SQL関数 list_project_chapter_stats() の1行（案件×章）
export type ChapterStat = {
  chapterNo: number;
  totalItems: number; // 不採用を除く
  confirmedItems: number;
  allItems: number; // 不採用を含む
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ProjectState = "not_started" | "in_progress" | "completed";
export type CtaKind = "continue" | "start" | "open";

export type ProjectSummary = {
  // 確定率の分母・分子：確定判定ダッシュボードと同じ（A/B/C章のみ。4・10・15章は含めない）
  total: number;
  confirmed: number;
  rate: number; // 表示用（四捨五入）
  fraction: number; // 並べ替え用（確定／総数）
  state: ProjectState;
  chapters: { chapterNo: number; status: ChapterStatus }[];
  confirmedChapters: number;
  workingChapters: number;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  continueChapterNo: number | null;
  cta: CtaKind;
};

// 章の状態：サイドバーの章ドットと同じ基準。
//  - A/B/C章：getReadinessSummaryと同じ（総数0＝未着手／充足率100%＝確定／それ以外＝進行中）
//  - 4章：行が1件でもあれば進行中（不採用も含めて数える。getSimpleChapterStatusesと同じ）
//  - 10章：不採用を除く行が1件でもあれば進行中／15章：progress_tasksが1件でもあれば進行中
//  4・10・15章は「確定」にならない（サイドバーも未着手／進行中の2段階のみ）。
export function chapterStatusOf(chapterNo: number, stat: ChapterStat | undefined): ChapterStatus {
  if (!stat) return "not_started";
  if (CHAPTER_TEMPLATE_MAP[chapterNo]) {
    const rate = stat.totalItems > 0 ? Math.round((stat.confirmedItems / stat.totalItems) * 100) : 0;
    return chapterStatusFromReadiness({ totalItems: stat.totalItems, readinessRate: rate });
  }
  if (chapterNo === 4) return stat.allItems > 0 ? "in_progress" : "not_started";
  return stat.totalItems > 0 ? "in_progress" : "not_started";
}

export function projectStateOf(total: number, confirmed: number): ProjectState {
  if (total === 0) return "not_started";
  if (confirmed >= total) return "completed";
  return confirmed > 0 ? "in_progress" : "not_started";
}

export function summarizeProject(selectedChapters: number[], stats: ChapterStat[]): ProjectSummary {
  const targets = [...new Set(selectedChapters)].filter((n) => CHAPTER_NAMES[n]).sort((a, b) => a - b);
  const byChapter = new Map(stats.map((s) => [s.chapterNo, s]));

  let total = 0;
  let confirmed = 0;
  for (const n of targets) {
    if (!CHAPTER_TEMPLATE_MAP[n]) continue;
    const s = byChapter.get(n);
    if (!s) continue;
    total += s.totalItems;
    confirmed += s.confirmedItems;
  }

  const chapters = targets.map((n) => ({ chapterNo: n, status: chapterStatusOf(n, byChapter.get(n)) }));
  const state = projectStateOf(total, confirmed);

  // 最後に編集した章（最終更新が最大。同時刻は章番号が小さい方）
  let last: { chapterNo: number; at: string; by: string | null } | null = null;
  for (const n of targets) {
    const s = byChapter.get(n);
    if (!s?.updatedAt) continue;
    if (!last || s.updatedAt > last.at) last = { chapterNo: n, at: s.updatedAt, by: s.updatedBy };
  }

  let continueChapterNo: number | null;
  let cta: CtaKind;
  if (state === "completed") {
    continueChapterNo = null;
    cta = "open";
  } else if (state === "not_started") {
    continueChapterNo = targets[0] ?? null;
    cta = "start";
  } else {
    continueChapterNo = last?.chapterNo ?? chapters.find((c) => c.status !== "confirmed")?.chapterNo ?? targets[0] ?? null;
    cta = "continue";
  }

  return {
    total,
    confirmed,
    rate: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    fraction: total > 0 ? confirmed / total : 0,
    state,
    chapters,
    confirmedChapters: chapters.filter((c) => c.status === "confirmed").length,
    workingChapters: chapters.filter((c) => c.status === "in_progress").length,
    lastUpdatedAt: last?.at ?? null,
    lastUpdatedBy: last?.by ?? null,
    continueChapterNo,
    cta,
  };
}

// 検索・並べ替え・絞り込み -------------------------------------------------

export type ListedProject = {
  id: string;
  name: string;
  customerId: string | null;
  customerName: string;
  platform: string | null;
  summary: ProjectSummary;
};

export type StatusFilter = "all" | ProjectState;
export type SortKey = "updated" | "progress" | "name" | "customer";

// 全角・半角の違い、大文字小文字の違いで外れないよう、比較前に双方をNFKC正規化して小文字化する
export function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

export function matchesQuery(p: ListedProject, query: string): boolean {
  const q = normalizeForSearch(query.trim());
  if (!q) return true;
  return normalizeForSearch(p.name).includes(q) || normalizeForSearch(p.customerName).includes(q);
}

// 検索と顧客での絞り込み（状態チップの件数はこの結果に対して数える）
export function filterBySearchAndCustomer(projects: ListedProject[], query: string, customerId: string): ListedProject[] {
  return projects.filter((p) => matchesQuery(p, query) && (!customerId || p.customerId === customerId));
}

export function countByState(projects: ListedProject[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: projects.length, in_progress: 0, not_started: 0, completed: 0 };
  for (const p of projects) counts[p.summary.state] += 1;
  return counts;
}

export function filterByStatus(projects: ListedProject[], status: StatusFilter): ListedProject[] {
  return status === "all" ? projects : projects.filter((p) => p.summary.state === status);
}

const ja = (a: string, b: string) => a.localeCompare(b, "ja");
const byId = (a: ListedProject, b: ListedProject) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// 同値の場合はidで順序を決める（実行のたびに並びが変わらないように）
export function sortProjects(projects: ListedProject[], key: SortKey): ListedProject[] {
  const cmp = (a: ListedProject, b: ListedProject): number => {
    switch (key) {
      case "updated": {
        const x = a.summary.lastUpdatedAt;
        const y = b.summary.lastUpdatedAt;
        if (x !== y) {
          if (x === null) return 1;
          if (y === null) return -1;
          return x > y ? -1 : 1;
        }
        return 0;
      }
      case "progress":
        return b.summary.fraction - a.summary.fraction;
      case "name":
        return ja(a.name, b.name);
      case "customer":
        return ja(a.customerName, b.customerName) || ja(a.name, b.name);
    }
  };
  return [...projects].sort((a, b) => cmp(a, b) || byId(a, b));
}
