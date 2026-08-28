export type RequirementStatus = "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved" | "rejected";

const LOCKED_STATUSES: RequirementStatus[] = ["confirmed", "exception_approved", "rejected"];

export function isItemLocked(status: string): boolean {
  return LOCKED_STATUSES.includes(status as RequirementStatus);
}
