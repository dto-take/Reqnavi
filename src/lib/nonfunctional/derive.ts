import type { AspectContent, AspectMaster, CheckItemContent, NonfunctionalNode } from "@/actions/nonfunctional";

// gantt/layout.tsと同じ考え方：Server Action・クライアントコンポーネントの両方から使う
// 派生値計算を1箇所にまとめ、重複実装を避ける。

export function isAspect(node: NonfunctionalNode): boolean {
  return node.parent_id === null;
}

export function aspectContent(node: NonfunctionalNode): AspectContent {
  return node.content as AspectContent;
}

export function checkItemContent(node: NonfunctionalNode): CheckItemContent {
  return node.content as CheckItemContent;
}

// nonfunctional_ux_phase4.md Step4で楽観的な並べ替えを実装する際に判明した点：
// order_indexの値をnodes配列の要素に上書きするだけでは、配列自体の並び順（Array.map()の
// 描画順）は変わらない。サーバーからの再取得（order by order_indexが効く）が届くまで
// 画面上の並びが変化せず、「楽観的更新のはずが実際は非楽観的」になっていた。
// order_index順に明示的にソートしてから返すことで、上書き値の反映・実データの反映
// どちらの経路でも同じように並び順へ反映されるようにする。
export function checkItemsOf(nodes: NonfunctionalNode[], aspectId: string): NonfunctionalNode[] {
  return nodes.filter((n) => n.parent_id === aspectId).sort((a, b) => a.order_index - b.order_index);
}

// nonfunctional_ux_phase1.md：「採用中」＝status !== 'rejected'の観点行
export function adoptedAspects(nodes: NonfunctionalNode[]): NonfunctionalNode[] {
  return nodes.filter((n) => isAspect(n) && n.status !== "rejected").sort((a, b) => a.order_index - b.order_index);
}

export type AspectStats = { total: number; judged: number; unknown: number };

export function aspectStats(nodes: NonfunctionalNode[], aspectId: string): AspectStats {
  const items = checkItemsOf(nodes, aspectId);
  const unknown = items.filter((i) => checkItemContent(i).judgement === "unknown").length;
  return { total: items.length, judged: items.length - unknown, unknown };
}

export type PoolItem =
  | { kind: "master"; masterId: string; name: string }
  | { kind: "rejected"; aspectId: string; name: string };

// Step3：未採用リスト＝(その案件で1件もrequirement_items行が存在しない標準観点マスタ) ∪
// (status='rejected'の観点行。過去に採用解除されたもの・独自観点も含む)
export function poolItems(nodes: NonfunctionalNode[], master: AspectMaster[]): PoolItem[] {
  const aspects = nodes.filter(isAspect);
  const usedMasterIds = new Set(
    aspects.map((a) => aspectContent(a).master_id).filter((id): id is string => id !== null)
  );
  const missingMasters: PoolItem[] = master
    .filter((m) => !usedMasterIds.has(m.id))
    .map((m) => ({ kind: "master", masterId: m.id, name: m.name }));
  const rejected: PoolItem[] = aspects
    .filter((a) => a.status === "rejected")
    .map((a) => ({ kind: "rejected", aspectId: a.id, name: aspectContent(a).name }));
  return [...missingMasters, ...rejected];
}

export function overallProgress(nodes: NonfunctionalNode[]): { judged: number; total: number } {
  let judged = 0;
  let total = 0;
  for (const a of adoptedAspects(nodes)) {
    const stats = aspectStats(nodes, a.id);
    judged += stats.judged;
    total += stats.total;
  }
  return { judged, total };
}

// nonfunctional_ux_phase4.md Step4：観点・チェック項目の並べ替えを楽観的更新にするための
// order_index再計算。Server Action側（reorderAspect/reorderCheckItem）が行う
// 「対象グループを一旦フラットに取得し、移動先ID配列へ組み替えてから0..n-1で振り直す」計算と
// 全く同じロジックをクライアント側でも先に計算し、サーバー確定前に画面へ即時反映する
// （進捗画面フェーズ4・規約59のパターン）。
export function computeReorderOverrides(
  orderedIds: string[],
  movedId: string,
  insertBeforeId: string | null
): Map<string, number> {
  const without = orderedIds.filter((id) => id !== movedId);
  const insertAt = insertBeforeId ? without.indexOf(insertBeforeId) : -1;
  const at = insertAt === -1 ? without.length : insertAt;
  const reordered = [...without];
  reordered.splice(at, 0, movedId);
  const overrides = new Map<string, number>();
  reordered.forEach((id, i) => overrides.set(id, i));
  return overrides;
}
