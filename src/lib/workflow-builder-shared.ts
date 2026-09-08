// SwimlaneCanvas / NodeEditPanel の両方から使う小さな純粋ヘルパー。
// src/actions/workflow-builder.ts は"use server"のため非同期関数以外をexportできず（規約17）、
// ここ（"use server"を付けない通常モジュール）に切り出している。
import type { WorkflowNodeRow } from "@/actions/workflow-builder";
import type { WorkflowNode } from "@/lib/workflow-layout";

export function toWorkflowNode(n: WorkflowNodeRow): WorkflowNode {
  return {
    id: n.id,
    node_type: n.node_type,
    label: n.label,
    role_lane: n.role_lane,
    branch: n.branch,
    parent_condition_id: n.parent_condition_id,
    order_index: n.order_index,
  };
}

export function branchSummary(nodes: WorkflowNodeRow[], conditionId: string, branch: "yes" | "no"): string {
  const items = nodes
    .filter((n) => n.parent_condition_id === conditionId && n.branch === branch)
    .sort((a, b) => a.order_index - b.order_index);
  if (items.length === 0) return "ノード未設定";
  return `${items.length}工程 ・ ${items.map((n) => n.label).join(" → ")}`;
}

// ノード種別マスタ（アイコン・色）。デザインハンドオフ「ノード種別マスタ」表をそのまま移植。
// 装飾ではなく情報の分類を担う配色のため、ReqNaviの--brandには置き換えない
// （docs/instructions/workflow_builder_phase_ab.md「重要な方針」節）。SwimlaneCanvas・
// NodeEditPanelの両方から使うため、ここに一元化する（規約36の重複定義を避ける考え方と同じ）。
export const NODE_META: Record<string, { label: string; color: string; tint: string; icon: string }> = {
  start: { label: "開始", color: "#059669", tint: "#d1fae5", icon: "M5 3l14 9-14 9z" },
  task: { label: "手動タスク", color: "#4f46e5", tint: "#e0e7ff", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" },
  approval: { label: "承認", color: "#7c3aed", tint: "#ede9fe", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM9 12l2 2 4-4" },
  condition: { label: "条件分岐", color: "#d97706", tint: "#fef3c7", icon: "M12 3l9 9-9 9-9-9z" },
  notify: { label: "自動通知", color: "#0284c7", tint: "#e0f2fe", icon: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.5 21a2 2 0 0 0 3 0" },
  action: { label: "自動処理", color: "#0d9488", tint: "#ccfbf1", icon: "M13 2L3 14h7l-1 8 10-12h-7z" },
  end: { label: "終了", color: "#64748b", tint: "#e2e8f0", icon: "M6 6h12v12H6z" },
};

export const RULE_OPS = ["≧", "≦", "=", "≠", "含む"] as const;

