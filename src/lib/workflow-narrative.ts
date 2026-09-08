// 業務フロービルダーの構造化データ（flow_nodes）から、業務手順表・ユースケース記述を
// 機械的に生成する純粋関数群。AI呼び出しは行わない（フェーズCの設計判断）。
//
// 型はsrc/lib/workflow-layout.tsのWorkflowNode（レイアウト計算専用の最小型）ではなく、
// src/actions/workflow-builder.tsのWorkflowNodeRow（mode・system_used・条件ルール等を
// 含むDB行フル型）を使う。業務手順表・ユースケース記述にはこれらの列が必須のため
// （WorkflowNodeRowの型定義自体は"use server"ファイルのtype exportで実行時依存は生じない）。
import type { WorkflowNodeRow, ConditionRule } from "@/actions/workflow-builder";

export type ProcedureRow = {
  stepNo: string;
  actor: string;
  action: string;
  mode: string;
  system: string;
  screenId: string;
  input: string;
  output: string;
  rule: string;
  branchContext: string | null;
};

type TreeNode = WorkflowNodeRow & { yesChain: TreeNode[]; noChain: TreeNode[] };

function buildTree(nodes: WorkflowNodeRow[]): TreeNode[] {
  const childrenByParent = new Map<string | null, WorkflowNodeRow[]>();
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

function formatRule(r: ConditionRule): string {
  return `${r.field} ${r.op} ${r.value || "—"}`;
}

// 条件文の日本語変換（例：[{field:"見積金額",op:"≧",value:"5000000"}] → "見積金額 ≧ 5000000"）。
// ルール未設定の場合は「（条件未設定）」とする。
function conditionText(node: WorkflowNodeRow): string {
  const rules = node.condition_rules ?? [];
  if (rules.length === 0) return "（条件未設定）";
  const joiner = node.condition_logic === "any" ? " または " : " かつ ";
  return rules.map(formatRule).join(joiner);
}

function actionLabel(node: WorkflowNodeRow): string {
  return node.label || "（未入力）";
}

function systemLabel(node: WorkflowNodeRow): string {
  return node.system_used || "（システム未定義）";
}

// mainチェーンを深さ優先で走査し、条件分岐に到達したらYESブランチ→NOブランチの順に
// 「親の番号-枝番」形式（例："2-1"）を割り当てながら再帰的に処理する。YES/NOは互いに
// 排他な別ルートのため、それぞれ独立に1から採番する（同じ"2-1"がYES側・NO側の両方に
// 現れ得る。branchContextでどちらのルートかを判別できるようにする）。
function walk(
  chain: TreeNode[],
  numberPrefix: string | null,
  branchContext: string | null,
  visit: (node: TreeNode, stepNo: string, branchContext: string | null) => void
) {
  chain.forEach((node, i) => {
    const stepNo = numberPrefix ? `${numberPrefix}-${i + 1}` : `${i + 1}`;
    visit(node, stepNo, branchContext);
    if (node.node_type === "condition") {
      const cond = conditionText(node);
      walk(node.yesChain, stepNo, `YESの場合：${cond}`, visit);
      walk(node.noChain, stepNo, `NOの場合：${cond}`, visit);
    }
  });
}

export function buildProcedureTable(nodes: WorkflowNodeRow[]): ProcedureRow[] {
  const tree = buildTree(nodes);
  const rows: ProcedureRow[] = [];
  walk(tree, null, null, (node, stepNo, branchContext) => {
    rows.push({
      stepNo,
      actor: node.role_lane || "—",
      action: actionLabel(node),
      mode: node.mode || "手動",
      system: systemLabel(node),
      screenId: node.screen_id || "—",
      input: node.input_data || "—",
      output: node.output_data || "—",
      rule: node.business_rule || "—",
      branchContext,
    });
  });
  return rows;
}

export function buildUseCaseText(nodes: WorkflowNodeRow[]): string {
  const tree = buildTree(nodes);
  const lines: string[] = [];

  function render(chain: TreeNode[], numberPrefix: string | null, indent: string) {
    chain.forEach((node, i) => {
      const stepNo = numberPrefix ? `${numberPrefix}-${i + 1}` : `${i + 1}`;
      const autoSuffix = node.mode === "自動" ? "（システムが自動実行）" : "";
      lines.push(`${indent}${stepNo}. ${node.role_lane || "担当者"}が「${actionLabel(node)}」を行う（${systemLabel(node)}）${autoSuffix}`);

      if (node.node_type === "condition") {
        lines.push(`${indent}   条件：${conditionText(node)} の場合`);

        lines.push(`${indent}   【YESの場合】`);
        if (node.yesChain.length > 0) {
          render(node.yesChain, stepNo, `${indent}   `);
        } else {
          lines.push(`${indent}   ${stepNo}-1. （工程未設定）`);
        }

        lines.push(`${indent}   【NOの場合】`);
        if (node.noChain.length > 0) {
          render(node.noChain, stepNo, `${indent}   `);
        } else {
          lines.push(`${indent}   ${stepNo}-1. （工程未設定）`);
        }
      }
    });
  }

  render(tree, null, "");
  return lines.length > 0 ? lines.join("\n") : "（業務フローが未作成です）";
}
