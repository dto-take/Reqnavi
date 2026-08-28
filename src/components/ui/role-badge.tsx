export type Role = "admin" | "exec" | "pmo" | "pm" | "member" | "partner";

const ROLE_MAP: Record<Role, { bg: string; text: string }> = {
  admin:   { bg: "var(--bg-hover)", text: "var(--text-primary)" },
  exec:    { bg: "var(--bg-hover)", text: "var(--text-primary)" },
  pmo:     { bg: "var(--bg-hover)", text: "var(--text-primary)" },
  pm:      { bg: "var(--bg-hover)", text: "var(--text-primary)" },
  member:  { bg: "var(--bg-hover)", text: "var(--text-primary)" },
  partner: { bg: "var(--status-needhearing-bg)", text: "var(--status-needhearing-text)" },
};

export function RoleBadge({ role }: { role: Role }) {
  const { bg, text } = ROLE_MAP[role];
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-medium w-fit"
      style={{ backgroundColor: bg, color: text }}
    >
      {role}
    </span>
  );
}
