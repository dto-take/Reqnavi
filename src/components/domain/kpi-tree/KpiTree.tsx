"use client";

import { useState } from "react";
import type { KpiNode } from "@/actions/kpi-tree";
import { KpiTreePane } from "@/components/domain/kpi-tree/KpiTreePane";
import { KpiDetailPane } from "@/components/domain/kpi-tree/KpiDetailPane";

// kpi_ux_phase1.md：単一ツリー表示（階層が深いほど入力欄が狭くなる）を、
// 左＝構造ペイン（ツリー）／右＝編集ペインの2ペイン構成に置き換える。
// 確定ワークフロー・AI候補生成・キーボード操作/並べ替えは本フェーズの対象外。

// kpi_ux_phase2.md Step4：折りたたみ状態を反映した「表示中の平坦なノード順序」。
// 深さ優先で辿り、折りたたまれているノードの子孫は含めない。nodesは既にorder_index順
// （listKpiTree）のため、親ごとの子リストもその順序をそのまま引き継ぐ。
function getVisibleFlatList(nodes: KpiNode[], collapsedIds: Set<string>): KpiNode[] {
  const byParent = new Map<string | null, KpiNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parent_id);
    if (list) list.push(n);
    else byParent.set(n.parent_id, [n]);
  }

  const result: KpiNode[] = [];
  function visit(parentId: string | null) {
    for (const child of byParent.get(parentId) ?? []) {
      result.push(child);
      if (!collapsedIds.has(child.id)) visit(child.id);
    }
  }
  visit(null);
  return result;
}

function getNextVisibleId(flatList: KpiNode[], currentId: string): string | null {
  const idx = flatList.findIndex((n) => n.id === currentId);
  return idx >= 0 && idx < flatList.length - 1 ? flatList[idx + 1].id : null;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 選択中ノードが削除された等で存在しなくなった場合は先頭ノードにフォールバックする
  // （selectedId自体は書き換えず、描画時にこの導出値だけで吸収する）。
  // 全ノード確定後にgetNextVisibleIdがnullを返しselectedIdがnullになった場合もここを通り、
  // 結果として先頭ノードが再選択される（指示書Step7-7が許容する「適切な終了状態」の一形態）。
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? nodes[0] ?? null;
  const visibleFlatList = getVisibleFlatList(nodes, collapsedIds);

  // 確定後に「表示中ツリーの次のノード」へ自動移動する（kpi_ux_phase2.md Step4/5）。
  function handleConfirmed(confirmedNodeId: string) {
    setSelectedId(getNextVisibleId(visibleFlatList, confirmedNodeId));
  }

  return (
    <div className="grid gap-5 items-start" style={{ gridTemplateColumns: "minmax(220px,300px) minmax(0,1fr)" }}>
      <KpiTreePane
        projectId={projectId}
        tenantId={tenantId}
        nodes={nodes}
        selectedId={selectedNode?.id ?? null}
        onSelect={setSelectedId}
        collapsedIds={collapsedIds}
        onToggleCollapse={toggleCollapse}
      />
      <KpiDetailPane
        projectId={projectId}
        tenantId={tenantId}
        nodes={nodes}
        selectedNode={selectedNode}
        onSelect={setSelectedId}
        visibleFlatList={visibleFlatList}
        onConfirmed={handleConfirmed}
      />
    </div>
  );
}
