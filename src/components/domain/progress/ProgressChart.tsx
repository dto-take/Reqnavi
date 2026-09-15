"use client";

import { useState } from "react";
import { createPhase, createTask } from "@/actions/progress-tasks";
import { visibleRows, computeGanttWindow, type ProgressTask } from "@/lib/gantt/layout";
import { WbsGanttPane } from "@/components/domain/progress/WbsGanttPane";
import { ProgressDetailPanel } from "@/components/domain/progress/ProgressDetailPanel";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// progress_ux_phase1.md：15章を、フラットなタスク一覧＋進捗スライダーから、
// 大工程／中工程の2階層＋WBS/ガント（左）＋詳細パネル（右）の2ペイン構成に置き換える。
// スケール切替・折りたたみ・担当フィルタ（フェーズ2）、依存関係・ドラッグ操作（フェーズ3）、
// キーボード操作・仕上げ（フェーズ4）は本フェーズの対象外。
export function ProgressChart({
  projectId,
  tenantId,
  nodes,
  memberNames,
}: {
  projectId: string;
  tenantId: string;
  nodes: ProgressTask[];
  memberNames: string[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { show } = useToast();

  const rows = visibleRows(nodes);
  const win = computeGanttWindow(nodes, rows);
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  async function handleAddPhase() {
    try {
      const newId = await createPhase(projectId, tenantId);
      setSelectedId(newId);
    } catch (e) {
      show(errorMessage(e), "error");
    }
  }

  async function handleAddTask(phaseId: string) {
    try {
      const newId = await createTask(projectId, tenantId, phaseId);
      setSelectedId(newId);
    } catch (e) {
      show(errorMessage(e), "error");
    }
  }

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] gap-0 border border-border rounded-lg overflow-hidden items-stretch"
      style={{ background: "var(--bg-page)" }}
    >
      <WbsGanttPane
        nodes={nodes}
        rows={rows}
        win={win}
        selectedId={selectedNode?.id ?? null}
        onSelect={setSelectedId}
        onAddPhase={handleAddPhase}
      />
      <ProgressDetailPanel
        projectId={projectId}
        nodes={nodes}
        selectedNode={selectedNode}
        memberNames={memberNames}
        onSelect={setSelectedId}
        onAddTask={handleAddTask}
      />
    </div>
  );
}
