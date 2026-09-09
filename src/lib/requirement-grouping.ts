// カード一覧を content.category（要件区分）でグループ化する純粋関数。DBに依存しない。
// フェーズ2の対象はcontent.categoryのみ（ステータス・優先度等の他軸切替は対象外）。
// 注意：この列は現状chapter_column_templatesのテンプレートCにのみ存在する（column_key="category"）。
// テンプレートA/Bの章にはこのキー自体が無いため、それらの章では全項目が単一の「未分類」
// グループにまとまる（指示書の対象範囲外：新しい列を追加しない、との方針のため）。
export const UNCATEGORIZED_LABEL = "未分類";

export type GroupedItems<T> = { category: string; items: T[] };

// order_indexそのものは関数内で参照しない（呼び出し側が既にorder_index順に
// ソート済みの配列を渡すという前提だけで成立する）ため、型制約には含めない。
// RequirementItem（クライアント側の型にorder_indexを持たない）でもそのまま使える。
export function groupByCategory<T extends { content: { category?: string } }>(items: T[]): GroupedItems<T>[] {
  // items は既にorder_index順にソート済みである前提。Mapは挿入順を保持するため、
  // category の初出順にグループが並び、各グループ内はitemsの元の順序を維持する。
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const category = item.content.category?.trim() || UNCATEGORIZED_LABEL;
    const list = groups.get(category);
    if (list) {
      list.push(item);
    } else {
      groups.set(category, [item]);
    }
  }
  return Array.from(groups.entries()).map(([category, groupItems]) => ({ category, items: groupItems }));
}
