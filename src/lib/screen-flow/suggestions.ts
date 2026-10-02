// screen_flow_ux_phase3.md Step2：画面遷移図のAI差分提案の正規化・配置（DB非依存の純粋関数）。
// モデルの生の出力の検証・整形をGeminiを呼ばずに単体で検証できるよう、ここに閉じ込める。
import { z } from "zod";
import { NODE_H, NODE_W } from "./derive";
import { COL_GAP, ORIGIN_X, ORIGIN_Y, ROW_GAP } from "./layout";
import { isItemLocked } from "../item-lock";

export const MAX_SUGGESTED_NODES = 8;
export const MAX_SUGGESTED_TRANSITIONS = 20;

// モデルへはuuidを渡さない。実ノードはS-NN、9章項目はF-NN、新規ノードはN1…の短い参照名。
export const RawSuggestionSchema = z.object({
  nodes: z
    .array(z.object({ key: z.string(), name: z.string(), function: z.string().nullable().optional(), why: z.string() }))
    .default([]),
  transitions: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().nullable().optional(), why: z.string() }))
    .default([]),
});
export type RawSuggestion = z.infer<typeof RawSuggestionSchema>;

export type EndpointRef = { ref: "node"; id: string } | { ref: "suggestion"; key: string };

export type SuggestContext = {
  nodes: { id: string; code: string | null; name: string; function_item_id: string | null; status: string }[];
  edges: { from_node: string; to_node: string }[];
  functions: { id: string; code: string }[];
  rejectedNodeNames: string[];
  rejectedTransitions: { from: string; to: string }[];
};

export type NormalizedNode = { key: string; name: string; function_item_id: string | null; why: string };
export type NormalizedTransition = { from: EndpointRef; to: EndpointRef; label: string; why: string };
export type NormalizedSuggestions = {
  nodes: NormalizedNode[];
  transitions: NormalizedTransition[];
  dropped: { nodes: number; transitions: number };
};

function normName(s: string): string {
  return s.normalize("NFKC").trim().toLowerCase();
}

function refKey(r: EndpointRef): string {
  return r.ref === "node" ? `n:${r.id}` : `s:${r.key}`;
}

export function normalizeSuggestions(
  raw: RawSuggestion,
  context: SuggestContext,
  limits: { nodes: number; transitions: number } = { nodes: MAX_SUGGESTED_NODES, transitions: MAX_SUGGESTED_TRANSITIONS }
): NormalizedSuggestions {
  const realByCode = new Map(context.nodes.filter((n) => n.code).map((n) => [n.code as string, n]));
  const realNames = new Set(context.nodes.map((n) => normName(n.name)));
  const functionByCode = new Map(context.functions.map((f) => [f.code, f.id]));
  const linkedFunctionIds = new Set(context.nodes.map((n) => n.function_item_id).filter((id): id is string => !!id));
  const rejectedNodeNames = new Set(context.rejectedNodeNames.map(normName));
  const rejectedPairs = new Set(context.rejectedTransitions.map((t) => `${normName(t.from)}>${normName(t.to)}`));
  const realPairs = new Set(context.edges.map((e) => `${e.from_node}>${e.to_node}`));

  const nodes: NormalizedNode[] = [];
  const seenKeys = new Set<string>();
  const seenNames = new Set<string>();
  const usedFunctions = new Set<string>();
  for (const n of raw.nodes) {
    const name = n.name.trim();
    const key = n.key.trim();
    if (!name || !key || seenKeys.has(key)) continue;
    const nn = normName(name);
    if (realNames.has(nn) || seenNames.has(nn) || rejectedNodeNames.has(nn)) continue;
    let functionId: string | null = null;
    if (n.function) {
      // 存在しないF-NNは紐付けなしとして扱う。既に別ノードへ紐付いている項目は捨てる。
      const id = functionByCode.get(n.function.trim());
      if (id) {
        if (linkedFunctionIds.has(id) || usedFunctions.has(id)) continue;
        functionId = id;
      }
    }
    seenKeys.add(key);
    seenNames.add(nn);
    if (functionId) usedFunctions.add(functionId);
    nodes.push({ key, name, function_item_id: functionId, why: n.why.trim() });
  }
  const keptNodes = nodes.slice(0, limits.nodes);
  const keptKeys = new Map(keptNodes.map((n) => [n.key, n]));

  function resolve(code: string): { ref: EndpointRef; name: string; locked: boolean } | null {
    const c = code.trim();
    const real = realByCode.get(c);
    if (real) return { ref: { ref: "node", id: real.id }, name: real.name, locked: isItemLocked(real.status) };
    const sug = keptKeys.get(c);
    if (sug) return { ref: { ref: "suggestion", key: sug.key }, name: sug.name, locked: false };
    return null;
  }

  const transitions: NormalizedTransition[] = [];
  const seenPairs = new Set<string>();
  for (const t of raw.transitions) {
    const from = resolve(t.from);
    const to = resolve(t.to);
    if (!from || !to) continue;
    const fk = refKey(from.ref);
    const tk = refKey(to.ref);
    if (fk === tk) continue;
    if (from.locked) continue;
    if (from.ref.ref === "node" && to.ref.ref === "node" && realPairs.has(`${from.ref.id}>${to.ref.id}`)) continue;
    if (seenPairs.has(`${fk}>${tk}`)) continue;
    if (rejectedPairs.has(`${normName(from.name)}>${normName(to.name)}`)) continue;
    seenPairs.add(`${fk}>${tk}`);
    transitions.push({ from: from.ref, to: to.ref, label: (t.label ?? "").trim(), why: t.why.trim() });
  }
  const keptTransitions = transitions.slice(0, limits.transitions);

  return {
    nodes: keptNodes,
    transitions: keptTransitions,
    dropped: {
      nodes: raw.nodes.length - keptNodes.length,
      transitions: raw.transitions.length - keptTransitions.length,
    },
  };
}

type Rect = { x: number; y: number };

function overlaps(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
}

// 提案ノードの座標を決定的に割り当てる。接続する実ノード（または先に配置済みの提案）があれば
// その右隣、無ければ既存ノードの外接矩形の下の格子に置く。重なる場合は下へずらす。
export function placeProposedNodes(
  realNodes: { id: string; x: number; y: number }[],
  proposals: { key: string }[],
  transitions: { from: EndpointRef; to: EndpointRef }[]
): Map<string, { x: number; y: number }> {
  const placed = new Map<string, { x: number; y: number }>();
  const occupied: Rect[] = realNodes.map((n) => ({ x: n.x, y: n.y }));
  const realPos = new Map(realNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const bottom = realNodes.reduce((m, n) => Math.max(m, n.y + NODE_H), ORIGIN_Y - 48);
  const gridTop = bottom + 48;
  let unanchored = 0;

  for (const p of proposals) {
    let anchor: Rect | null = null;
    for (const t of transitions) {
      const other = t.from.ref === "suggestion" && t.from.key === p.key ? t.to : t.to.ref === "suggestion" && t.to.key === p.key ? t.from : null;
      if (!other) continue;
      const pos = other.ref === "node" ? realPos.get(other.id) : placed.get(other.key);
      if (pos) {
        anchor = pos;
        break;
      }
    }
    let cand: Rect;
    if (anchor) {
      cand = { x: anchor.x + COL_GAP, y: anchor.y };
    } else {
      cand = { x: ORIGIN_X + (unanchored % 4) * COL_GAP, y: gridTop + Math.floor(unanchored / 4) * ROW_GAP };
      unanchored += 1;
    }
    for (let i = 0; i < 500 && occupied.some((o) => overlaps(o, cand)); i++) cand = { x: cand.x, y: cand.y + ROW_GAP };
    cand = { x: Math.max(0, Math.round(cand.x)), y: Math.max(0, Math.round(cand.y)) };
    placed.set(p.key, cand);
    occupied.push(cand);
  }
  return placed;
}
