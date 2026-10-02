// screen_flow_ux_phase1.md Step2：画面遷移図の派生値計算（DB非依存の純粋関数）。
// ハンドオフHTMLのgeom()の実装を一次情報として移植している。

export const NODE_W = 176;
export const NODE_H = 72;
export const STAGE_W = 1080;
export const STAGE_H = 660;

export type FlowNodeLike = { id: string; label: string; pos_x: number | null; pos_y: number | null; function_item_id: string | null };
export type FlowEdgeLike = { id: string; from_node: string; to_node: string; label: string | null };

// 9章の画面情報を持つ項目の判定。「画面イメージ」ページ・AI一括生成・xlsx出力と同じ条件。
export function hasScreenInfo(content: Record<string, string | null | undefined>): boolean {
  return (content.screen_fields ?? "").trim() !== "";
}

// 格子状の初期座標（横270px・縦120px間隔、4列）。ステージ外にはみ出さないようクランプする。
export function gridPosition(index: number): { x: number; y: number } {
  return {
    x: 40 + (index % 4) * 270,
    y: Math.min(30 + Math.floor(index / 4) * 120, STAGE_H - NODE_H),
  };
}

export function clampPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, x), STAGE_W - NODE_W),
    y: Math.min(Math.max(0, y), STAGE_H - NODE_H),
  };
}

export function nodePosition(node: FlowNodeLike, index: number): { x: number; y: number } {
  if (node.pos_x !== null && node.pos_y !== null) return { x: node.pos_x, y: node.pos_y };
  return gridPosition(index);
}

export function degrees(nodes: FlowNodeLike[], edges: FlowEdgeLike[]): Map<string, { in: number; out: number }> {
  const map = new Map(nodes.map((n) => [n.id, { in: 0, out: 0 }]));
  for (const e of edges) {
    const from = map.get(e.from_node);
    const to = map.get(e.to_node);
    if (from) from.out += 1;
    if (to) to.in += 1;
  }
  return map;
}

export type FlowWarning = { nodeId: string; name: string; reason: string };

// 要確認：9章未紐付け／入出遷移がともに0（孤立）。両方該当する場合は理由を「・」で連結する。
export function flowWarnings(nodes: FlowNodeLike[], edges: FlowEdgeLike[]): FlowWarning[] {
  const deg = degrees(nodes, edges);
  const result: FlowWarning[] = [];
  for (const n of nodes) {
    const reasons: string[] = [];
    if (!n.function_item_id) reasons.push("9章の画面に未紐付け");
    const d = deg.get(n.id);
    if (d && d.in === 0 && d.out === 0) reasons.push("遷移がない（孤立）");
    if (reasons.length > 0) result.push({ nodeId: n.id, name: n.label, reason: reasons.join("・") });
  }
  return result;
}

export function isIsolated(nodeId: string, deg: Map<string, { in: number; out: number }>): boolean {
  const d = deg.get(nodeId);
  return !!d && d.in === 0 && d.out === 0;
}

// 「9章にあって図にない画面」：画面情報を持つ9章項目のうち、rejectedを除き、どのノードにも
// 紐付いていないもの。
export function unplacedFunctions<T extends { id: string; status: string; hasScreen: boolean }>(
  items: T[],
  nodes: FlowNodeLike[]
): T[] {
  const linked = new Set(nodes.map((n) => n.function_item_id).filter((id): id is string => !!id));
  return items.filter((i) => i.hasScreen && i.status !== "rejected" && !linked.has(i.id));
}

export type EdgeGeometry = { d: string; arrow: string; lx: number; ly: number };

// ハンドオフHTMLのgeom()の移植。往復ペア（A→BとB→A）では、右向きの線を-14px、左向きの線を
// +14pxオフセットして重ならないようにする。
export function edgeGeometry(a: { x: number; y: number }, b: { x: number; y: number }, paired: boolean): EdgeGeometry {
  const W = NODE_W;
  const H = NODE_H;
  let sx: number, sy: number, tx: number, ty: number, c1x: number, c1y: number, c2x: number, c2y: number;
  if (b.x >= a.x + W - 10) {
    const off = paired ? -14 : 0;
    sx = a.x + W;
    sy = a.y + H / 2 + off;
    tx = b.x;
    ty = b.y + H / 2 + off;
    const dx = Math.max(40, (tx - sx) / 2);
    c1x = sx + dx;
    c1y = sy;
    c2x = tx - dx;
    c2y = ty;
  } else if (b.x + W <= a.x + 10) {
    sx = a.x;
    sy = a.y + H / 2 + 14;
    tx = b.x + W;
    ty = b.y + H / 2 + 14;
    const dx = Math.max(40, (sx - tx) / 2);
    c1x = sx - dx;
    c1y = sy;
    c2x = tx + dx;
    c2y = ty;
  } else {
    const down = b.y > a.y;
    // 縦方向（横に重なる配置）は原典に往復オフセットが無く、往復ペアが重なるため、
    // 往復の場合は左右にずらす（行きは+18、戻りは-18）。
    const xo = paired ? (down ? 18 : -18) : 18;
    sx = a.x + W / 2 + xo;
    sy = down ? a.y + H : a.y;
    tx = b.x + W / 2 + xo;
    ty = down ? b.y : b.y + H;
    const dy = Math.max(30, Math.abs(ty - sy) / 2) * (down ? 1 : -1);
    c1x = sx;
    c1y = sy + dy;
    c2x = tx;
    c2y = ty - dy;
  }
  const lx = (sx + 3 * c1x + 3 * c2x + tx) / 8;
  const ly = (sy + 3 * c1y + 3 * c2y + ty) / 8;
  const ang = Math.atan2(ty - c2y, tx - c2x);
  const L = 9;
  const Wd = 4.5;
  const bx = tx - L * Math.cos(ang);
  const by = ty - L * Math.sin(ang);
  const px = -Math.sin(ang) * Wd;
  const py = Math.cos(ang) * Wd;
  return {
    d: `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${bx},${by}`,
    arrow: `M${tx},${ty} L${bx + px},${by + py} L${bx - px},${by - py} Z`,
    lx,
    ly,
  };
}

export function hasReverseEdge(edge: FlowEdgeLike, edges: FlowEdgeLike[]): boolean {
  return edges.some((x) => x.from_node === edge.to_node && x.to_node === edge.from_node);
}

// 9章の画面情報を持つ項目（図の右パネル・「9章にあって図にない画面」用の表示用データ）。
export type FunctionItem = {
  id: string;
  name: string;
  status: string;
  hasScreen: boolean;
  code: string;
  pattern: string;
  fields: string[];
  actions: string[];
};
