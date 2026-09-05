"use client";

import { useTransition } from "react";
import {
  createKpiNode,
  updateKpiNodeText,
  deleteKpiNode,
  type KpiNode,
} from "@/actions/kpi-tree";
import { KPI_LEVELS, KPI_LEVEL_DESCRIPTIONS, type KpiLevel } from "@/lib/kpi-levels";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function buildTree(nodes: KpiNode[], parentId: string | null): KpiNode[] {
  return nodes.filter((n) => n.parent_id === parentId);
}

function nextLevel(level: KpiLevel): KpiLevel | null {
  const idx = KPI_LEVELS.indexOf(level);
  return idx < KPI_LEVELS.length - 1 ? KPI_LEVELS[idx + 1] : null;
}

export function KpiTree({
  projectId,
  tenantId,
  nodes,
}: {
  projectId: string;
  tenantId: string;
  nodes: KpiNode[];
}) {
  const [isPending, startTransition] = useTransition();

  function renderNode(node: KpiNode, depth: number) {
    const children = buildTree(nodes, node.id);
    const childLevel = nextLevel(node.content.level);

    return (
      <div key={node.id} style={{ marginLeft: depth * 20 }} className="mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] text-faint w-10"
            title={KPI_LEVEL_DESCRIPTIONS[node.content.level]}
          >
            {node.content.level}
          </span>
          <Input
            defaultValue={node.content.text}
            onBlur={(e) => startTransition(() => updateKpiNodeText(node.id, projectId, e.target.value))}
            className="flex-1"
          />
          {childLevel && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => startTransition(() => createKpiNode(projectId, tenantId, node.id, childLevel))}
            >
              + {childLevel}を追加
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => {
              if (confirm("本当に削除しますか？この操作は取り消せません。")) {
                startTransition(() => deleteKpiNode(node.id, projectId));
              }
            }}
          >
            削除
          </Button>
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  const roots = buildTree(nodes, null);

  return (
    <div className="border border-border rounded-lg p-4">
      {roots.map((r) => renderNode(r, 0))}
      {roots.length === 0 && (
        <Button
          variant="ghost"
          size="md"
          onClick={() => startTransition(() => createKpiNode(projectId, tenantId, null, "ゴール"))}
        >
          + ゴールを追加
        </Button>
      )}
    </div>
  );
}
