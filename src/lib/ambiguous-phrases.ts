export const AMBIGUOUS_PHRASES = [
  "等", "柔軟に", "原則として", "基本的に", "場合によっては",
  "適宜", "必要に応じて", "できる限り", "概ね",
] as const;

export type AmbiguousFlag = {
  source: "dictionary" | "ai" | "extraction";
  field?: string; // dictionary/ai判定時のみ（フィールド単位の判定）
  // 本文中のインライン表示（フェーズ5）に使う該当フレーズの文字列。dictionaryは検出した
  // 辞書語そのもの、aiはプロンプトが返した該当箇所の文字列。extraction由来は元々この情報を
  // 持たないため、phraseが無い場合はインライン表示せずバッジのみの表示にフォールバックする。
  phrase?: string;
  reason?: string; // ai/extraction判定時のみ
};

export function scanContentForAmbiguousPhrases(
  content: Record<string, string | null>
): AmbiguousFlag[] {
  const flags: AmbiguousFlag[] = [];
  for (const [field, value] of Object.entries(content)) {
    if (!value) continue;
    for (const phrase of AMBIGUOUS_PHRASES) {
      if (value.includes(phrase)) {
        flags.push({ source: "dictionary", field, phrase });
      }
    }
  }
  return flags;
}
