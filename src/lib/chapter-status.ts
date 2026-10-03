export type ChapterStatus = "not_started" | "in_progress" | "confirmed";

export function statusColor(status: ChapterStatus): { bg: string; text: string } {
  if (status === "confirmed") return { bg: "var(--status-confirmed-bg)", text: "var(--status-confirmed-text)" };
  if (status === "in_progress") return { bg: "var(--status-review-bg)", text: "var(--status-review-text)" };
  return { bg: "var(--status-draft-bg)", text: "var(--status-draft-text)" };
}
