"use client";

import { useCallback, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { createPhase, createTask } from "@/actions/progress-tasks";
import { visibleRows, computeGanttWindow, type ProgressTask, type GanttScale } from "@/lib/gantt/layout";
import { WbsGanttPane } from "@/components/domain/progress/WbsGanttPane";
import { ProgressDetailPanel } from "@/components/domain/progress/ProgressDetailPanel";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// progress_ux_phase1.md：15章を、フラットなタスク一覧＋進捗スライダーから、
// 大工程／中工程の2階層＋WBS/ガント（左）＋詳細パネル（右）の2ペイン構成に置き換える。
// progress_ux_phase2.md：スケール切替（日/週/月）・折りたたみ（永続化）・担当フィルタを追加する。
// 依存関係・ドラッグ操作（フェーズ3）、キーボード操作・仕上げ（フェーズ4）は本フェーズの対象外。

// 規約54：localStorage同期はuseSyncExternalStoreを使う。要件定義画面UX改善フェーズ2の
// RequirementGroup.tsxのuseCollapsedと同じ形（getServerSnapshotは常に空、書き込みは
// forceRenderで即時反映）を、Set<string>を1つのJSON配列として保存する形に拡張する。
function collapsedPhasesKey(projectId: string): string {
  return `reqnavi:progress-collapsed:${projectId}:15`;
}

const noopSubscribe = () => () => {};
const emptySnapshot = () => "";

function useCollapsedPhases(projectId: string): [Set<string>, (phaseId: string) => void] {
  const key = collapsedPhasesKey(projectId);
  const [, forceRender] = useReducer((c: number) => c + 1, 0);

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }, [key]);

  const raw = useSyncExternalStore(noopSubscribe, getSnapshot, emptySnapshot);
  const collapsed = useMemo(() => new Set<string>(raw ? (JSON.parse(raw) as string[]) : []), [raw]);

  function toggle(phaseId: string) {
    const next = new Set(collapsed);
    if (next.has(phaseId)) next.delete(phaseId);
    else next.add(phaseId);
    try {
      localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      // 保存できなくても開閉自体は機能させる
    }
    forceRender();
  }

  return [collapsed, toggle];
}

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
  const [scale, setScale] = useState<GanttScale>("day");
  const [ownerFocus, setOwnerFocus] = useState<string | null>(null);
  const [collapsedPhaseIds, toggleCollapse] = useCollapsedPhases(projectId);
  const { show } = useToast();

  const rows = visibleRows(nodes, collapsedPhaseIds);
  const win = computeGanttWindow(nodes, rows, scale);
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

  function handleToggleOwnerFocus(name: string) {
    setOwnerFocus((prev) => (prev === name ? null : name));
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
        scale={scale}
        onScaleChange={setScale}
        onJumpToday={() => setScale("day")}
        collapsedPhaseIds={collapsedPhaseIds}
        onToggleCollapse={toggleCollapse}
        ownerFocus={ownerFocus}
        onToggleOwnerFocus={handleToggleOwnerFocus}
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
