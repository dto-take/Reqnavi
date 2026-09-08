"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SwimlaneCanvas } from "@/components/domain/workflow-builder/SwimlaneCanvas";
import { NodeEditPanel } from "@/components/domain/workflow-builder/NodeEditPanel";
import { NodePalette } from "@/components/domain/workflow-builder/NodePalette";
import { ProcedureTable } from "@/components/domain/workflow-builder/ProcedureTable";
import { UseCaseNarrative } from "@/components/domain/workflow-builder/UseCaseNarrative";
import { useToast } from "@/components/ui/toast";
import type { WorkflowNodeRow } from "@/actions/workflow-builder";

const VIEWS = ["canvas", "table", "narrative"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { canvas: "フロー図", table: "業務手順表", narrative: "ユースケース記述" };

type InsertTarget = { conditionId: string; branch: "yes" | "no" } | null;

export function WorkflowBuilderClient({
  projectId,
  initialNodes,
  insertAction,
}: {
  projectId: string;
  initialNodes: WorkflowNodeRow[];
  insertAction: (afterNodeId: string | null, nodeType: string) => Promise<{ id: string | null; error: string | null }>;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [nodes, setNodes] = useState(initialNodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertTarget, setInsertTarget] = useState<InsertTarget>(null);
  const [view, setView] = useState<View>("canvas");
  const [isInserting, startInsertTransition] = useTransition();

  // insertWorkflowNodeAfter・deleteConditionNode等は挿入位置に応じて既存の複数ノードの
  // parent_condition_id/branch/order_indexを書き換え得る（不変条件の維持・Yesルートの展開等）。
  // ローカルstateを部分的に手でパッチすると整合性が壊れやすいため、これらの操作後は
  // router.refresh()でServer Componentから最新の全件を取り直す。initialNodesが変わったら
  // nodesを同期する仕組みは既存のまま（レンダー中に直接setStateするReact推奨パターン）。
  const [prevInitialNodes, setPrevInitialNodes] = useState(initialNodes);
  if (initialNodes !== prevInitialNodes) {
    setPrevInitialNodes(initialNodes);
    setNodes(initialNodes);
  }

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const actorOptions = Array.from(new Set(nodes.map((n) => n.role_lane).filter(Boolean)));

  function handleSelect(id: string | null) {
    setSelectedId(id);
    setInsertTarget(null);
  }

  function handleSelectStub(conditionId: string, branch: "yes" | "no") {
    setInsertTarget({ conditionId, branch });
    setSelectedId(null);
  }

  function handleLocalChange(nodeId: string, patch: Partial<WorkflowNodeRow>) {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
  }

  function handleDeleted() {
    setSelectedId(null);
    setInsertTarget(null);
    router.refresh();
  }

  // クリック挿入・ドラッグ&ドロップ挿入の共通コア。afterNodeIdは実ノードID／
  // スタブID（"stub:<conditionId>:<yes|no>"形式）のいずれも受け付ける（フェーズD参照）。
  function performInsert(afterNodeId: string | null, nodeType: string) {
    startInsertTransition(() => {
      insertAction(afterNodeId, nodeType).then((res) => {
        if (res.error) {
          show(res.error, "error");
          return;
        }
        setSelectedId(res.id);
        setInsertTarget(null);
        setView("canvas");
        router.refresh();
      });
    });
  }

  function handleInsert(nodeType: string) {
    const afterNodeId = insertTarget ? `stub:${insertTarget.conditionId}:${insertTarget.branch}` : selectedId;
    performInsert(afterNodeId, nodeType);
  }

  // ドラッグ&ドロップでは、選択中ノード/挿入先スタブの状態に関わらず、
  // ドロップされた先（targetId）が明示的な挿入先になる
  function handleDropInsert(targetId: string, nodeType: string) {
    performInsert(targetId, nodeType);
  }

  // デザインハンドオフ「挿入先ヒントの文言」節と同じ優先順位
  const insertHint = insertTarget
    ? `${insertTarget.branch === "yes" ? "Yes" : "No"} ルートの末尾に挿入します`
    : selectedNode
      ? `「${selectedNode.label}」の直後に挿入します`
      : "フローの末尾に追加します";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-xs px-3 py-1.5 rounded-md cursor-pointer ${
              view === v ? "bg-brand text-white" : "text-secondary hover:bg-hover"
            }`}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {view === "canvas" && (
        <div className="flex gap-4" style={{ height: "calc(100vh - 260px)", minHeight: 440 }}>
          <NodePalette insertHint={insertHint} disabled={isInserting} onInsert={handleInsert} />
          <div className="flex-1 min-w-0">
            <SwimlaneCanvas
              nodes={nodes}
              selectedId={selectedId}
              onSelect={handleSelect}
              insertTarget={insertTarget}
              onSelectStub={handleSelectStub}
              onInsert={handleDropInsert}
            />
          </div>
          <div className="w-88 flex-none border border-border rounded-lg bg-page overflow-hidden">
            <NodeEditPanel
              node={selectedNode}
              allNodes={nodes}
              projectId={projectId}
              actorOptions={actorOptions}
              onLocalChange={handleLocalChange}
              onDeleted={handleDeleted}
              onDeselect={() => handleSelect(null)}
            />
          </div>
        </div>
      )}

      {view === "table" && <ProcedureTable projectId={projectId} nodes={nodes} />}
      {view === "narrative" && <UseCaseNarrative nodes={nodes} />}
    </div>
  );
}
