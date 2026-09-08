"use client";

import { useState } from "react";
import { SwimlaneCanvas } from "@/components/domain/workflow-builder/SwimlaneCanvas";
import { NodeEditPanel } from "@/components/domain/workflow-builder/NodeEditPanel";
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
}: {
  projectId: string;
  initialNodes: WorkflowNodeRow[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    <div className="flex gap-4" style={{ height: "calc(100vh - 200px)", minHeight: 480 }}>
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
  );
}
