// 業務フロービルダー（条件分岐対応のスイムレーンレイアウト）のレイアウト計算。
// DBに依存しない純粋関数。docs/instructions/design_handoff_workflow_builder/README.md の
// 「スイムレーン レイアウトアルゴリズム」節・「コネクタの描画ルール」節をそのまま移植したもの。

export type WorkflowNode = {
  id: string;
  node_type: string;
  label: string;
  role_lane: string;
  branch: "main" | "yes" | "no";
  parent_condition_id: string | null;
  order_index: number;
};

export type Connector = {
  from: string;
  to: string;
  kind: "normal" | "long" | "stub";
  label?: string | null;
};

export type LayoutResult = {
  laneOrder: string[];
  positions: Map<string, { row: number; lane: number }>;
  connectors: Connector[];
  stubs: { afterNodeId: string; branch: "yes" | "no" }[];
  canvasWidth: number;
  canvasHeight: number;
  // 走査順（＝ハンドオフのstepNoと同じ順）の工程番号。スタブは含まない
  stepNumbers: Map<string, number>;
};

export const LANE_WIDTH = 268;
export const CARD_HEIGHT = 100;
export const VERTICAL_GAP = 52;
export const PITCH = CARD_HEIGHT + VERTICAL_GAP;
export const CANVAS_TOP_OFFSET = 28;
const LONG_THRESHOLD_ROWS = 1.4;

export function stubId(conditionNodeId: string, branch: "yes" | "no"): string {
  return `stub:${conditionNodeId}:${branch}`;
}

export function laneX(lane: number, laneWidth: number = LANE_WIDTH): number {
  return lane * laneWidth + laneWidth / 2;
}

export function rowY(row: number): number {
  return CANVAS_TOP_OFFSET + row * PITCH;
}

type TreeNode = WorkflowNode & { yesChain: TreeNode[]; noChain: TreeNode[] };

// 前提：条件分岐ノードは所属chainの終端であることが呼び出し側で保証されている
// （ハンドオフREADME「重要な不変条件」）。本フェーズはノード挿入UIが対象外のため、
// この不変条件はテストデータ投入時に手動で守る。
function buildTree(nodes: WorkflowNode[]): TreeNode[] {
  const childrenByParent = new Map<string | null, WorkflowNode[]>();
  for (const n of nodes) {
    const list = childrenByParent.get(n.parent_condition_id) ?? [];
    list.push(n);
    childrenByParent.set(n.parent_condition_id, list);
  }

  function buildChain(parentId: string | null, branch: "main" | "yes" | "no"): TreeNode[] {
    return (childrenByParent.get(parentId) ?? [])
      .filter((n) => n.branch === branch)
      .sort((a, b) => a.order_index - b.order_index)
      .map((n) => ({
        ...n,
        yesChain: n.node_type === "condition" ? buildChain(n.id, "yes") : [],
        noChain: n.node_type === "condition" ? buildChain(n.id, "no") : [],
      }));
  }

  return buildChain(null, "main");
}

function linkKind(fromRow: number, toRow: number): "normal" | "long" {
  return Math.abs(toRow - fromRow) > LONG_THRESHOLD_ROWS ? "long" : "normal";
}

export function computeWorkflowLayout(nodes: WorkflowNode[]): LayoutResult {
  const tree = buildTree(nodes);

  const laneOrder: string[] = [];
  function laneIndex(name: string): number {
    let i = laneOrder.indexOf(name);
    if (i === -1) {
      laneOrder.push(name);
      i = laneOrder.length - 1;
    }
    return i;
  }

  const positions = new Map<string, { row: number; lane: number }>();
  const connectors: Connector[] = [];
  const stubs: LayoutResult["stubs"] = [];
  const stepNumbers = new Map<string, number>();
  let maxRow = 0;
  let stepNo = 0;

  // chainをrowから配置し、次に空いているrowを返す
  function place(chain: TreeNode[], row: number, parentId: string | null): number {
    let r = row;
    let prevId: string | null = parentId;

    for (const node of chain) {
      const lane = laneIndex(node.role_lane);
      positions.set(node.id, { row: r, lane });
      stepNo += 1;
      stepNumbers.set(node.id, stepNo);
      maxRow = Math.max(maxRow, r);

      if (prevId) {
        const fromRow = positions.get(prevId)!.row;
        connectors.push({ from: prevId, to: node.id, kind: linkKind(fromRow, r), label: null });
      }

      if (node.node_type === "condition") {
        const yesRow = r + 1;
        let yesEnd: number;

        if (node.yesChain.length > 0) {
          yesEnd = place(node.yesChain, yesRow, node.id);
          labelConnector(connectors, node.id, node.yesChain[0].id, "Yes");
        } else {
          const sId = stubId(node.id, "yes");
          positions.set(sId, { row: yesRow, lane });
          connectors.push({ from: node.id, to: sId, kind: "stub", label: "Yes" });
          stubs.push({ afterNodeId: node.id, branch: "yes" });
          maxRow = Math.max(maxRow, yesRow);
          yesEnd = yesRow + 1;
        }

        if (node.noChain.length > 0) {
          const noEnd = place(node.noChain, yesEnd, node.id);
          labelConnector(connectors, node.id, node.noChain[0].id, "No");
          maxRow = Math.max(maxRow, noEnd - 1);
          return maxRow + 1;
        } else {
          const sId = stubId(node.id, "no");
          positions.set(sId, { row: yesEnd, lane });
          connectors.push({ from: node.id, to: sId, kind: "stub", label: "No" });
          stubs.push({ afterNodeId: node.id, branch: "no" });
          maxRow = Math.max(maxRow, yesEnd);
          return maxRow + 1;
        }
      }

      prevId = node.id;
      r += 1;
    }
    return r;
  }

  place(tree, 0, null);

  return {
    laneOrder,
    positions,
    connectors,
    stubs,
    stepNumbers,
    canvasWidth: laneOrder.length * LANE_WIDTH,
    canvasHeight: rowY(maxRow) + CARD_HEIGHT + 60,
  };
}

function labelConnector(connectors: Connector[], from: string, to: string, label: "Yes" | "No") {
  const c = connectors.find((c) => c.from === from && c.to === to);
  if (c) c.label = label;
}
