export function readinessBarColor(rate: number): string {
  if (rate >= 80) return "var(--status-confirmed-text)";
  if (rate >= 40) return "var(--status-review-text)";
  return "var(--status-needhearing-text)";
}
