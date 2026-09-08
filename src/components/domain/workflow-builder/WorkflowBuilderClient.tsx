"use client";

import { useState } from "react";
import { SwimlaneCanvas } from "@/components/domain/workflow-builder/SwimlaneCanvas";
import { NodeEditPanel } from "@/components/domain/workflow-builder/NodeEditPanel";
import { SubmitButton } from "@/components/ui/submit-button";
import type { WorkflowNodeRow } from "@/actions/workflow-builder";

// 選択ノードが条件分岐の場合、削除するとparent_condition_idのon delete cascadeで
// DB側は配下（yes/no）ごとまとめて消える。ローカルstateも同じ範囲を除去して一致させる。
function removeSubtree(nodes: WorkflowNodeRow[], id: string): WorkflowNodeRow[] {
  const toRemove = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.parent_condition_id && toRemove.has(n.parent_condition_id) && !toRemove.has(n.id)) {
        toRemove.add(n.id);
        changed = true;
      }
    }
  }
  return nodes.filter((n) => !toRemove.has(n.id));
}

export function WorkflowBuilderClient({
  projectId,
  initialNodes,
  appendAction,
}: {
  projectId: string;
  initialNodes: WorkflowNodeRow[];
  appendAction: () => Promise<void>;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // appendWorkflowNode（<form action>経由）はrevalidatePathでこのページのServer Componentを
  // 再実行させるだけで、既にマウント済みのこのクライアントコンポーネントのuseStateは
  // 自動では追従しない（Reactはpropsの変化だけでuseStateの初期値を再評価しない）ため、
  // initialNodesが変わったらnodesを同期する。useEffectではなくレンダー中に直接setState
  // するReact推奨パターン（https://react.dev/learn/you-might-not-need-an-effect）を使い、
  // 余分な再レンダー・チラつきを避ける。編集中の未blurの入力がある状態で他ノードの
  // 追加ボタンを押すと、その未保存分がこの同期で失われ得るが、暫定機能のため許容する。
  const [prevInitialNodes, setPrevInitialNodes] = useState(initialNodes);
  if (initialNodes !== prevInitialNodes) {
    setPrevInitialNodes(initialNodes);
    setNodes(initialNodes);
  }

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const actorOptions = Array.from(new Set(nodes.map((n) => n.role_lane).filter(Boolean)));

  function handleLocalChange(nodeId: string, patch: Partial<WorkflowNodeRow>) {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
  }

  function handleDeleted() {
    if (!selectedId) return;
    setNodes((prev) => removeSubtree(prev, selectedId));
    setSelectedId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4" style={{ height: "calc(100vh - 240px)", minHeight: 440 }}>
        <div className="flex-1 min-w-0">
          <SwimlaneCanvas nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="w-88 flex-none border border-border rounded-lg bg-page overflow-hidden">
          <NodeEditPanel
            node={selectedNode}
            allNodes={nodes}
            projectId={projectId}
            actorOptions={actorOptions}
            onLocalChange={handleLocalChange}
            onDeleted={handleDeleted}
            onDeselect={() => setSelectedId(null)}
          />
        </div>
      </div>

      {/* フェーズDの本格的なパレットまでの暫定対応（本線末尾への単純追加のみ） */}
      <form action={appendAction}>
        <SubmitButton variant="secondary" size="sm" pendingText="追加中...">
          + 本線の末尾に工程を追加
        </SubmitButton>
      </form>
    </div>
  );
}
