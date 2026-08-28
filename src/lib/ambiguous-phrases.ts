export const AMBIGUOUS_PHRASES = [
  "等", "柔軟に", "原則として", "基本的に", "場合によっては",
  "適宜", "必要に応じて", "できる限り", "概ね",
] as const;

export type AmbiguousFlag = {
  source: "dictionary" | "ai" | "extraction";
  field?: string; // dictionary/ai判定時のみ（フィールド単位の判定）
  phrase?: string; // dictionary判定時のみ
  reason?: string; // ai/extraction判定時のみ
  matched_text?: string;
};

export function scanContentForAmbiguousPhrases(
  content: Record<string, string | null>
): AmbiguousFlag[] {
  const flags: AmbiguousFlag[] = [];
  for (const [field, value] of Object.entries(content)) {
    if (!value) continue;
    for (const phrase of AMBIGUOUS_PHRASES) {
      if (value.includes(phrase)) {
        flags.push({ source: "dictionary", field, phrase, matched_text: value });
      }
    }
  }
  return flags;
}
