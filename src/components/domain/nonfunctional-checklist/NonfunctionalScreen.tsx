"use client";

import { runAction } from "@/lib/run-action";
import { useMemo, useState, useTransition } from "react";
import {
  adoptMasterAspect,
  createCustomAspect,
  reactivateAspect,
  reorderAspect,
  reorderCheckItem,
  type AspectMaster,
  type NonfunctionalNode,
} from "@/actions/nonfunctional";
import { adoptedAspects, checkItemsOf, computeReorderOverrides } from "@/lib/nonfunctional/derive";
import { AspectCatalogPane } from "@/components/domain/nonfunctional-checklist/AspectCatalogPane";
import { AspectDetailPane } from "@/components/domain/nonfunctional-checklist/AspectDetailPane";
import { useToast } from "@/components/ui/toast";

// nonfunctional_ux_phase1.md：10章を、観点カードが常設で並ぶ形式から、標準観点マスタに
// 基づく採用中/未採用カタログ（左）＋観点詳細（右）の2ペイン構成に置き換える。
// progress_ux_phase1.md（WbsGanttPane/ProgressChart）・kpi_ux_phase1.md（KpiTree）と
// 同じ「page.tsxは薄いラッパー、この1ファイルがローカル状態を持つオーケストレータ」の形。
// nonfunctional_ux_phase4.md Step4：観点・チェック項目の並べ替えは楽観的更新にする
// （進捗画面フェーズ4・規約59のパターンを踏襲）。order_indexの上書き値をnodesへ合成した
// displayNodesを両ペインへ渡し、サーバー確定前に並びを即時反映する。失敗時は該当idの
// 上書きだけを取り除いて元の並びへ戻し、エラートーストを表示する。
export function NonfunctionalScreen({
  projectId,
  tenantId,
  master,
  nodes,
}: {
  projectId: string;
  tenantId: string;
  master: AspectMaster[];
  nodes: NonfunctionalNode[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [orderOverrides, setOrderOverrides] = useState<Map<string, number>>(new Map());
  const { show } = useToast();

  // サーバーから届いたnodesが上書き値に追いついた分は、renderの中で単純に無視することで
  // 自然に無効化する（useEffect＋setStateはreact-hooks/set-state-in-effectに抵触するため使わない。
  // progress_ux_phase4.md ProgressChart.tsxのdisplayNodesと同じ考え方）。
  const displayNodes = useMemo(() => {
    if (orderOverrides.size === 0) return nodes;
    return nodes.map((n) => {
      const ov = orderOverrides.get(n.id);
      return ov === undefined || ov === n.order_index ? n : { ...n, order_index: ov };
    });
  }, [nodes, orderOverrides]);

  const adopted = adoptedAspects(displayNodes);
  // 選択中の観点が採用解除された・まだ何も選んでいない場合は、採用中の先頭にフォールバックする
  // （KpiTreeのnodes.find(...) ?? nodes[0]と同じ考え方）。
  const selectedAspect = adopted.find((n) => n.id === selectedId) ?? adopted[0] ?? null;

  function handleAdoptMaster(masterId: string, name: string) {
    startTransition(async () => {
      const r = await runAction(() => adoptMasterAspect(projectId, tenantId, masterId, name), show);
      if (r) setSelectedId(r.data);
    });
  }

  function handleReactivate(aspectId: string) {
    startTransition(async () => {
      const r = await runAction(() => reactivateAspect(aspectId, projectId), show);
      if (r) setSelectedId(aspectId);
    });
  }

  function handleCreateCustom(name: string) {
    startTransition(async () => {
      const r = await runAction(() => createCustomAspect(projectId, tenantId, name), show);
      if (r) setSelectedId(r.data);
    });
  }

  function applyOverrides(map: Map<string, number>) {
    setOrderOverrides((prev) => {
      const next = new Map(prev);
      map.forEach((v, k) => next.set(k, v));
      return next;
    });
  }
  function clearOverrides(ids: string[]) {
    setOrderOverrides((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function handleReorderAspect(aspectId: string, insertBeforeAspectId: string | null) {
    const orderedIds = adoptedAspects(nodes).map((a) => a.id);
    const overrides = computeReorderOverrides(orderedIds, aspectId, insertBeforeAspectId);
    applyOverrides(overrides);
    startTransition(async () => {
      // 失敗（{ok:false}・通信エラーとも）のときは、楽観的な上書きを外して元へ戻す。トーストはrunActionが1件だけ出す
      const r = await runAction(() => reorderAspect(projectId, aspectId, insertBeforeAspectId), show);
      if (!r) clearOverrides([...overrides.keys()]);
    });
  }

  function handleReorderCheckItem(aspectId: string, itemId: string, insertBeforeItemId: string | null) {
    const orderedIds = checkItemsOf(nodes, aspectId).map((i) => i.id);
    const overrides = computeReorderOverrides(orderedIds, itemId, insertBeforeItemId);
    applyOverrides(overrides);
    startTransition(async () => {
      const r = await runAction(() => reorderCheckItem(aspectId, projectId, itemId, insertBeforeItemId), show);
      if (!r) clearOverrides([...overrides.keys()]);
    });
  }

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-0 border border-border rounded-lg overflow-hidden items-stretch"
      style={{ background: "var(--bg-page)" }}
    >
      <AspectCatalogPane
        master={master}
        nodes={displayNodes}
        selectedId={selectedAspect?.id ?? null}
        onSelect={setSelectedId}
        onAdoptMaster={handleAdoptMaster}
        onReactivate={handleReactivate}
        onCreateCustom={handleCreateCustom}
        onReorder={handleReorderAspect}
        isPending={isPending}
      />
      <AspectDetailPane
        key={selectedAspect?.id ?? "none"}
        projectId={projectId}
        tenantId={tenantId}
        master={master}
        nodes={displayNodes}
        selectedAspect={selectedAspect}
        onSelect={setSelectedId}
        onUnadopted={() => setSelectedId(null)}
        onReorderCheckItem={handleReorderCheckItem}
      />
    </div>
  );
}
