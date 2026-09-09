import { STATUS_MAP, type Status } from "@/components/ui/status-badge";

// カード一覧を content.category（要件区分）でグループ化する純粋関数。DBに依存しない。
// フェーズ2の対象はcontent.categoryのみ（ステータス・優先度等の他軸切替は対象外）。
// 注意：この列は現状chapter_column_templatesのテンプレートCにのみ存在する（column_key="category"）。
// テンプレートA/Bの章にはこのキー自体が無いため、それらの章では全項目が単一の「未分類」
// グループにまとまる（指示書の対象範囲外：新しい列を追加しない、との方針のため）。
export const UNCATEGORIZED_LABEL = "未分類";

// フェーズ4：フィルタチップとグループ軸切替の型。RequirementTable.tsx・FilterBar.tsxの
// 両方（どちらも別々のクライアントコンポーネント）から参照するため、循環参照を避けて
// この共有モジュールに置く。
export type FilterType = "all" | "todo" | "ambiguous" | "confirmed";
export type GroupByAxis = "category" | "status" | "none";

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

// 表示上の絞り込みのみを行う純粋関数。order_index等の実データには一切触れない
// （フィルタ後の配列をServer Actionに渡して並び替え等に使ってはならない）。
export function applyFilter<T extends { status: string; ambiguous_flags: unknown[] }>(
  items: T[],
  filter: FilterType
): T[] {
  if (filter === "todo") return items.filter((i) => i.status === "ai_draft" || i.status === "se_reviewing");
  if (filter === "ambiguous") return items.filter((i) => i.ambiguous_flags.length > 0);
  if (filter === "confirmed") return items.filter((i) => i.status === "confirmed" || i.status === "exception_approved");
  return items;
}

// ステータス軸のグループ化順は、データ中の出現順（groupByCategoryと同じMap挿入順方式）に
// 頼らず、業務上自然なワークフロー順（AI素案→SE確認中→確定→例外承認→不採用）に固定する。
// ステータス軸は並び替え不可（指示書の「要件区分軸のときのみ並び替え有効」の方針）のため、
// 見た目の一貫性を優先してこの固定順にする。
const STATUS_DISPLAY_ORDER: Status[] = ["ai_draft", "se_reviewing", "confirmed", "exception_approved", "rejected", "need_hearing"];

export function groupByStatus<T extends { status: string }>(items: T[]): GroupedItems<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    // item.statusはrequirement_itemsの実際の値（need_hearingを含まない）だが、STATUS_MAPの
    // キー型Statusはより広い。表示ラベルの参照のみに使うためas Statusでキャストする
    // （anyは使わない。規約15）。未知の値が来た場合はラベルの代わりに生の値を表示する。
    const label = STATUS_MAP[item.status as Status]?.label ?? item.status;
    const list = groups.get(label);
    if (list) list.push(item);
    else groups.set(label, [item]);
  }
  const orderedLabels = STATUS_DISPLAY_ORDER.map((s) => STATUS_MAP[s].label);
  return Array.from(groups.entries())
    .sort(([a], [b]) => orderedLabels.indexOf(a) - orderedLabels.indexOf(b))
    .map(([category, groupItems]) => ({ category, items: groupItems }));
}

export function groupByNone<T>(items: T[]): GroupedItems<T>[] {
  return [{ category: "", items }];
}
