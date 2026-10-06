// AI素案の再生成で、人が触れた項目（確認中・確定・例外承認・不採用）と同じ内容の素案を除く純粋関数。
// DB・AIに依存しない（単体で確認できるようにするため、ai-draft.tsから切り出している）。

type Content = Record<string, unknown>;

// 重複の判定用：全角・半角の違い（NFKC）と、空白・改行の違いを無視する
export function normalizeForCompare(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "");
}

function textOf(content: Content, key: string): string {
  const v = content[key];
  return typeof v === "string" ? normalizeForCompare(v) : "";
}

// 比べる本文：本文の列（bodyKey）に値があればそれ。空なら、列の定義順で最初に値のある列（テキスト）。
// 区分（category）・見出し（name）は本文ではないため、他に値のある列が無いときだけ使う。
// 素案と保持された項目の両方に、同じ規則で使う。値のある列が無ければ""（比較の対象外）。
export function comparisonText(content: Content, columnKeys: string[], bodyKey: string | null): string {
  if (bodyKey) {
    const body = textOf(content, bodyKey);
    if (body !== "") return body;
  }
  for (const key of columnKeys) {
    if (key === "category" || key === "name") continue;
    const t = textOf(content, key);
    if (t !== "") return t;
  }
  for (const key of ["name", "category"]) {
    if (columnKeys.includes(key)) {
      const t = textOf(content, key);
      if (t !== "") return t;
    }
  }
  return "";
}

export function filterDuplicateDrafts<T extends { content: Content }>(
  drafts: T[],
  retainedContents: Content[],
  columnKeys: string[],
  bodyKey: string | null
): { kept: T[]; excludedCount: number } {
  const retained = new Set(retainedContents.map((c) => comparisonText(c, columnKeys, bodyKey)).filter((t) => t !== ""));
  const kept = drafts.filter((d) => {
    const t = comparisonText(d.content, columnKeys, bodyKey);
    return t === "" || !retained.has(t);
  });
  return { kept, excludedCount: drafts.length - kept.length };
}
