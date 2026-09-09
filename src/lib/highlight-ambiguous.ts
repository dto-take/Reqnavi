// 本文中の曖昧表現該当箇所をインライン表示するための純粋関数。DBに依存しない。
// phraseを持たないフラグ（extraction由来等）は無視する（呼び出し側でバッジのみの
// 表示にフォールバックさせるため、この関数はエラーを投げず単に対象外として扱う）。
export type HighlightSegment = { text: string; isAmbiguous: boolean; reason?: string };

export function highlightAmbiguousPhrases(
  text: string,
  flags: { phrase?: string; reason?: string }[]
): { segments: HighlightSegment[] } {
  type Match = { start: number; end: number; reason?: string };
  const matches: Match[] = [];
  for (const flag of flags) {
    if (!flag.phrase) continue;
    const start = text.indexOf(flag.phrase);
    if (start === -1) continue; // 編集で該当箇所が消えている等。エラーにはしない
    matches.push({ start, end: start + flag.phrase.length, reason: flag.reason });
  }

  if (matches.length === 0) {
    return { segments: [{ text, isAmbiguous: false }] };
  }

  // 開始位置でソートし、既にハイライト範囲と重なる後続の一致はスキップする
  // （同じフレーズが複数回出現する場合は最初の1箇所のみ、という指示書の簡易仕様に加えて、
  // 異なるフラグ同士の一致範囲が重なった場合にセグメント分割が破綻しないようにするため）
  matches.sort((a, b) => a.start - b.start);
  const nonOverlapping: Match[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const m of nonOverlapping) {
    if (m.start > cursor) segments.push({ text: text.slice(cursor, m.start), isAmbiguous: false });
    segments.push({ text: text.slice(m.start, m.end), isAmbiguous: true, reason: m.reason });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isAmbiguous: false });

  return { segments };
}
