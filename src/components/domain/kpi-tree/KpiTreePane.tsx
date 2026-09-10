"use client";

import { useTransition } from "react";
import { createKpiNode, type KpiNode } from "@/actions/kpi-tree";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// kpi_ux_phase2.md Step6：状態ドットの色。新しいステータス列は追加せず、既存の
// requirement_items.statusをそのまま3色にマップする（下書き=グレー／要レビュー=琥珀／確定=緑）。
// exception_approvedはこのKPIフローでは現状発生しないが、isItemLockedと同じ「確定済み扱い」に寄せておく。
function statusDotColor(status: KpiNode["status"]): string {
  if (status === "confirmed" || status === "exception_approved") return "var(--status-confirmed-text)";
  if (status === "se_reviewing") return "var(--status-review-text)";
  return "var(--text-faint)";
}
export function KpiTreePane({
  projectId,
  tenantId,
  nodes,
  selectedId,
  onSelect,
  collapsedIds,
  onToggleCollapse,
}: {
  projectId: string;
  tenantId: string;
  nodes: KpiNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  // ゴールは章に1件（parent_id: null）という既存のデータモデルを踏襲する
  const goal = nodes.find((n) => n.parent_id === null) ?? null;

  function childrenOf(id: string): KpiNode[] {
    return nodes.filter((n) => n.parent_id === id);
  }

  function handleAddRoot() {
    startTransition(async () => {
      try {
        const newId = goal
          ? await createKpiNode(projectId, tenantId, goal.id, "目標")
          : await createKpiNode(projectId, tenantId, null, "ゴール");
        onSelect(newId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function renderRow(node: KpiNode, depth: number) {
    const children = childrenOf(node.id);
    const hasChildren = children.length > 0;
    const collapsed = collapsedIds.has(node.id);
    const selected = node.id === selectedId;
    const isBold = node.content.level === "ゴール" || node.content.level === "目標";

    return (
      <div key={node.id}>
        <div
          data-kpi-node={node.id}
          onClick={() => onSelect(node.id)}
          className="flex items-center gap-1.5 rounded-md cursor-pointer text-[12.5px]"
          style={{
            padding: `7px 8px 7px ${8 + depth * 15}px`,
            background: selected ? "#fff" : "transparent",
            borderLeft: `3px solid ${selected ? "var(--text-primary)" : "transparent"}`,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) onToggleCollapse(node.id);
            }}
            className="w-2.5 flex-none text-faint font-mono text-[10px] cursor-pointer"
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren ? (collapsed ? "▸" : "▾") : ""}
          </button>
          <span className="font-mono text-[9.5px] text-faint flex-none tracking-wide">{node.content.level}</span>
          <span className={`flex-1 min-w-0 truncate ${isBold ? "font-bold" : selected ? "font-medium" : ""}`}>
            {node.content.text || "（未入力）"}
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full flex-none"
            style={{ background: statusDotColor(node.status) }}
          />
        </div>
        {hasChildren && !collapsed && children.map((c) => renderRow(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg flex flex-col self-start" style={{ background: "var(--bg-sidebar)" }}>
      <div className="px-4 py-3.5 border-b border-border flex flex-col gap-1.5">
        <span
          className="self-start text-[11px] font-medium px-2.5 py-0.5 rounded-full"
          style={{ background: "var(--status-review-bg)", color: "var(--status-review-text)" }}
        >
          未確定 {nodes.filter((n) => n.status !== "confirmed").length}
        </span>
        <h1 className="text-lg font-semibold text-primary">KPI</h1>
      </div>

      <div className="flex-1 p-2 flex flex-col gap-px" style={{ maxHeight: 520, overflowY: "auto" }}>
        {goal ? (
          renderRow(goal, 0)
        ) : (
          <p className="text-xs text-faint px-2 py-3">まだゴールがありません</p>
        )}
      </div>

      <div className="p-2 border-t border-border">
        <button
          type="button"
          disabled={isPending}
          onClick={handleAddRoot}
          className="w-full text-left text-xs text-faint border border-dashed border-border rounded-md px-3.5 py-2.5 cursor-pointer hover:bg-page hover:text-brand disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {goal ? "＋ 目標を追加" : "＋ ゴールを追加"}
        </button>
      </div>
    </div>
  );
}
