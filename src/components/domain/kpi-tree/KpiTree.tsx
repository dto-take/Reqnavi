"use client";

import { useState, useTransition } from "react";
import { confirmKpiNode, type KpiNode } from "@/actions/kpi-tree";
import { KpiTreePane } from "@/components/domain/kpi-tree/KpiTreePane";
import { KpiDetailPane } from "@/components/domain/kpi-tree/KpiDetailPane";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";
import { isItemLocked } from "@/lib/item-lock";

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
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

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

  // フェーズ4 Step3：キーボードショートカット（Cmd/Ctrl+Enter＝確定して次へ）からも
  // 同じ処理を呼べるよう、確定ロジック自体をKpiDetailPaneからここに引き上げる
  // （確定後の「次のノードへ移動」は元々ここが持っていたため、両方を1箇所に統合する）。
  function handleConfirmNode(nodeId: string) {
    startTransition(async () => {
      try {
        await confirmKpiNode(nodeId, projectId);
        setSelectedId(getNextVisibleId(visibleFlatList, nodeId));
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  // フェーズ4 Step3：上下矢印キーでツリー内の選択を移動、Cmd/Ctrl+Enterで確定して次へ。
  // フォーカスがinput/textareaにある場合は矢印キーを本来のカーソル移動に任せる
  // （選択移動を横取りしない）。Tab/Shift+Tab自体は一切ハンドリングしない＝ブラウザ標準の
  // フォーカス移動のまま（指示書の注意書き：アクセシビリティを損なうため本フェーズでは
  // 実装しない）。
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !isTextInput) {
      if (!selectedNode) return;
      const idx = visibleFlatList.findIndex((n) => n.id === selectedNode.id);
      if (idx === -1) return;
      const nextIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= visibleFlatList.length) return;
      e.preventDefault();
      setSelectedId(visibleFlatList[nextIdx].id);
      return;
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      if (!selectedNode || isItemLocked(selectedNode.status)) return;
      e.preventDefault();
      handleConfirmNode(selectedNode.id);
    }
  }

  // フェーズ4 Step4：1024px未満（Tailwindのlgブレークポイントと一致）で構造ペインが
  // 極端に潰れないよう、狭い画面では2ペインを縦積みに切り替える簡易対応
  // （ハンドオフの「ドロワー化」までは行わないが、指示書の「必須ではない」範囲での対応）。
  // kpi_pane_width.md Step1：構造ペイン（ツリー）が狭く長い文言が過剰に省略される問題を
  // 解消するため、220-300pxから300-420pxへ拡幅する。
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)] gap-5 items-start"
      onKeyDown={handleKeyDown}
    >
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
        onConfirm={handleConfirmNode}
        confirmPending={isPending}
      />
    </div>
  );
}
