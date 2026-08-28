type Status = "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved" | "need_hearing" | "rejected";

const STATUS_MAP: Record<Status, { label: string; bg: string; text: string }> = {
  ai_draft:          { label: "AI素案",     bg: "var(--status-draft-bg)",      text: "var(--status-draft-text)" },
  se_reviewing:      { label: "SE確認中",   bg: "var(--status-review-bg)",     text: "var(--status-review-text)" },
  confirmed:         { label: "確定",       bg: "var(--status-confirmed-bg)",  text: "var(--status-confirmed-text)" },
  exception_approved:{ label: "例外承認",   bg: "#EAE6F5",                      text: "#6E5A9E" },
  need_hearing:      { label: "要ヒアリング", bg: "var(--status-needhearing-bg)", text: "var(--status-needhearing-text)" },
  // bg/textは共にai_draftと同じペア（draft-bg単体にtext-faintを合わせるとコントラスト比が
  // 約3:1まで落ちるため、既に十分なコントラストが確認済みのdraft-textペアを流用する）
  rejected:          { label: "不採用",     bg: "var(--status-draft-bg)",      text: "var(--status-draft-text)" },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, bg, text } = STATUS_MAP[status];
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}
