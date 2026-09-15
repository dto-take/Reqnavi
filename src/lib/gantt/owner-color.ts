// progress_ux_phase1.md：担当者の色は新しいテーブルを持たず、担当者名の文字列から
// 決定論的に算出する（同じ名前なら常に同じ色になるハッシュ関数）。
const OWNER_PALETTE = [
  "var(--owner-color-1)",
  "var(--owner-color-2)",
  "var(--owner-color-3)",
  "var(--owner-color-4)",
  "var(--owner-color-5)",
  "var(--owner-color-6)",
  "var(--owner-color-7)",
  "var(--owner-color-8)",
];

export function ownerColor(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "var(--owner-color-unassigned)";
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % OWNER_PALETTE.length;
  return OWNER_PALETTE[index];
}
