// screen_flow_ux_phase2.md Step3：「自動で整列」の配置ロジック（DB非依存の純粋関数）。
// 座標の原点・間隔はハンドオフHTMLのautoLayout()（x = 40 + 層*270, y = 30 + 行*120）に合わせる。
// クライアント（上書き値の即時反映）とサーバー（保存）で同じ結果になるよう、この関数だけを持つ。

export type LayoutNode = { id: string; screen_code: string | null; order_index: number };
export type LayoutEdge = { from_node: string; to_node: string };

const ORIGIN_X = 40;
const ORIGIN_Y = 30;
const COL_GAP = 270;
const ROW_GAP = 120;

// screen_code昇順（S-01, S-02…は桁数が揃うため文字列比較で良い）。無ければorder_index、最後にid。
function compareNodes(a: LayoutNode, b: LayoutNode): number {
  const ca = a.screen_code ?? "";
  const cb = b.screen_code ?? "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  if (a.order_index !== b.order_index) return a.order_index - b.order_index;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function autoLayoutPositions(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  const sorted = [...nodes].sort(compareNodes);
  const rank = new Map(sorted.map((n, i) => [n.id, i]));
  const ids = new Set(sorted.map((n) => n.id));
  const incoming = new Map(sorted.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>(sorted.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.from_node) || !ids.has(e.to_node)) continue;
    incoming.set(e.to_node, (incoming.get(e.to_node) ?? 0) + 1);
    outgoing.get(e.from_node)!.push(e.to_node);
  }
  for (const list of outgoing.values()) list.sort((a, b) => rank.get(a)! - rank.get(b)!);

  // 入次数0のノードが起点。1つも無い（全体が循環）場合はscreen_code最小のノードを起点にする。
  const roots = sorted.filter((n) => incoming.get(n.id) === 0);
  const queue = (roots.length > 0 ? roots : [sorted[0]]).map((n) => n.id);
  const layer = new Map<string, number>();
  queue.forEach((id) => layer.set(id, 0));
  // 各ノードの層は最初に到達した時点の層（循環があっても無限ループにならない）
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    for (const to of outgoing.get(id)!) {
      if (!layer.has(to)) {
        layer.set(to, layer.get(id)! + 1);
        queue.push(to);
      }
    }
  }

  // 層ごとの並び：起点から到達できたノード（screen_code順）→ 到達できないノード（同順）。
  // 到達できないノードは第0層の、到達できたノードの下に並ぶ。
  const columns = new Map<number, LayoutNode[]>();
  for (const n of sorted) {
    if (!layer.has(n.id)) continue;
    const L = layer.get(n.id)!;
    columns.set(L, [...(columns.get(L) ?? []), n]);
  }
  for (const n of sorted) {
    if (layer.has(n.id)) continue;
    columns.set(0, [...(columns.get(0) ?? []), n]);
  }
  for (const [L, list] of columns) {
    list.forEach((n, row) => result.set(n.id, { x: ORIGIN_X + L * COL_GAP, y: ORIGIN_Y + row * ROW_GAP }));
  }
  return result;
}
