"use client";

import { useCallback, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { createPhase, createTask, shiftTaskDates } from "@/actions/progress-tasks";
import { visibleRows, computeGanttWindow, type ProgressTask, type GanttScale } from "@/lib/gantt/layout";
import { WbsGanttPane } from "@/components/domain/progress/WbsGanttPane";
import { ProgressDetailPanel } from "@/components/domain/progress/ProgressDetailPanel";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// progress_ux_phase1.md：15章を、フラットなタスク一覧＋進捗スライダーから、
// 大工程／中工程の2階層＋WBS/ガント（左）＋詳細パネル（右）の2ペイン構成に置き換える。
// progress_ux_phase2.md：スケール切替（日/週/月）・折りたたみ（永続化）・担当フィルタを追加する。
// progress_ux_phase3.md：先行工程の依存関係・コネクタ線・ドラッグでの期間変更を追加する。
// progress_ux_phase4.md：WBSの矢印キー選択移動、ドラッグ結果の楽観的更新＋失敗時ロールバックを追加する。

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

  // progress_ux_phase4.md Step2：ドラッグ確定後、サーバー保存の完了を待たずに画面へ即時反映する
  // 楽観的更新のための上書き値。nodesはサーバーコンポーネントから渡されるpropで、
  // revalidatePath後の再取得が届くまでは古い値のままのため、overridesが無いと
  // ドラッグ確定の瞬間に一度古い位置へ戻り、再取得完了時に新しい位置へ飛ぶ「戻って進む」
  // ちらつきが発生する。
  const [overrides, setOverrides] = useState<Map<string, { week_start: string; week_end: string }>>(new Map());

  // サーバーから届いたnodesが上書き値に追いついたら、その上書きはただの重複表示になるだけで
  // 実害は無いため、useEffectでの後片付けはしない（react-hooks/set-state-in-effectが指摘する
  // 「エフェクト内での同期的なsetState」を避けるため、renderの中で単純に無視する形にする）。
  // 上書きを明示的に消すのは、保存失敗時のロールバック（handleShiftTask）のみ。
  const displayNodes = useMemo(() => {
    if (overrides.size === 0) return nodes;
    return nodes.map((n) => {
      const ov = overrides.get(n.id);
      if (!ov || (ov.week_start === n.week_start && ov.week_end === n.week_end)) return n;
      return { ...n, ...ov };
    });
  }, [nodes, overrides]);

  const rows = visibleRows(displayNodes, collapsedPhaseIds);
  const win = computeGanttWindow(displayNodes, rows, scale);
  const selectedNode = displayNodes.find((n) => n.id === selectedId) ?? null;

  // progress_ux_phase4.md Step1：kpi-tree/KpiTree.tsxのhandleKeyDownと同じ方針。
  // 入力欄（select含む）にフォーカスがある間は矢印キーを本来のカーソル/選択肢移動に任せる。
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const isFormField = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || isFormField) return;
    if (rows.length === 0) return;
    const idx = rows.findIndex((n) => n.id === selectedId);
    if (idx === -1) {
      e.preventDefault();
      setSelectedId(rows[0].id);
      return;
    }
    const nextIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= rows.length) return;
    e.preventDefault();
    setSelectedId(rows[nextIdx].id);
  }

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

  // progress_ux_phase4.md Step2：ドラッグ確定時点でoverridesへ即時反映し（楽観的更新）、
  // サーバー保存が失敗した場合はoverridesを取り除いて元の表示に戻し、エラーをトースト表示する。
  // 成功時は明示的に消さず、nodes再取得（revalidatePath）が追いついた時点でdisplayNodesの
  // 比較（上記useMemo）が自然に無視するようになる。
  async function handleShiftTask(taskId: string, newStart: string, newEnd: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, { week_start: newStart, week_end: newEnd });
      return next;
    });
    try {
      await shiftTaskDates(taskId, projectId, newStart, newEnd);
    } catch (e) {
      setOverrides((prev) => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
      show(errorMessage(e), "error");
    }
  }

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] gap-0 border border-border rounded-lg overflow-hidden items-stretch"
      style={{ background: "var(--bg-page)" }}
      onKeyDown={handleKeyDown}
    >
      <WbsGanttPane
        nodes={displayNodes}
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
        onShiftTask={handleShiftTask}
      />
      <ProgressDetailPanel
        projectId={projectId}
        nodes={displayNodes}
        selectedNode={selectedNode}
        memberNames={memberNames}
        onSelect={setSelectedId}
        onAddTask={handleAddTask}
      />
    </div>
  );
}
