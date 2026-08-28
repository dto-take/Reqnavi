import type { FlowStep } from "@/actions/business-flow";

export type FlowDiffResult = {
  newSteps: FlowStep[]; // To-Beのみに存在
  removedSteps: FlowStep[]; // As-Isのみに存在
};

// ラベルの完全一致（前後空白除去・大文字小文字無視）で比較する簡易実装。
// 表記ゆれ（「顧客登録」と「顧客情報登録」等）は同一ステップとして検出できない前提。
export function diffFlowSteps(asisSteps: FlowStep[], tobeSteps: FlowStep[]): FlowDiffResult {
  const normalize = (s: string) => s.trim().toLowerCase();
  const asisLabels = new Set(asisSteps.map((s) => normalize(s.label)));
  const tobeLabels = new Set(tobeSteps.map((s) => normalize(s.label)));

  return {
    newSteps: tobeSteps.filter((s) => !asisLabels.has(normalize(s.label))),
    removedSteps: asisSteps.filter((s) => !tobeLabels.has(normalize(s.label))),
  };
}
