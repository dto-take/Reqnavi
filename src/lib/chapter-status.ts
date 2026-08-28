import type { ChapterReadiness } from "@/actions/readiness";

export type ChapterStatus = "not_started" | "in_progress" | "confirmed";

export function statusColor(status: ChapterStatus): { bg: string; text: string } {
  if (status === "confirmed") return { bg: "var(--status-confirmed-bg)", text: "var(--status-confirmed-text)" };
  if (status === "in_progress") return { bg: "var(--status-review-bg)", text: "var(--status-review-text)" };
  return { bg: "var(--status-draft-bg)", text: "var(--status-draft-text)" };
}

// A/B/C章向け。純粋な同期関数のため、"use server"ファイル（src/actions/readiness.ts）には
// 置けない（規約17：非同期関数以外をexportできない）。ここに切り出す。
export function chapterStatusFromReadiness(r: ChapterReadiness): ChapterStatus {
  if (r.totalItems === 0) return "not_started";
  if (r.readinessRate >= 100) return "confirmed";
  return "in_progress";
}
