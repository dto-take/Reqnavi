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

export function checkItemsOf(nodes: NonfunctionalNode[], aspectId: string): NonfunctionalNode[] {
  return nodes.filter((n) => n.parent_id === aspectId);
}

// nonfunctional_ux_phase1.md：「採用中」＝status !== 'rejected'の観点行
export function adoptedAspects(nodes: NonfunctionalNode[]): NonfunctionalNode[] {
  return nodes.filter((n) => isAspect(n) && n.status !== "rejected");
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
