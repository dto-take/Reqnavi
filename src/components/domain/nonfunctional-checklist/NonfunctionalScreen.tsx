"use client";

import { useState, useTransition } from "react";
import { adoptMasterAspect, createCustomAspect, reactivateAspect, reorderAspect, type AspectMaster, type NonfunctionalNode } from "@/actions/nonfunctional";
import { adoptedAspects } from "@/lib/nonfunctional/derive";
import { AspectCatalogPane } from "@/components/domain/nonfunctional-checklist/AspectCatalogPane";
import { AspectDetailPane } from "@/components/domain/nonfunctional-checklist/AspectDetailPane";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

// nonfunctional_ux_phase1.md：10章を、観点カードが常設で並ぶ形式から、標準観点マスタに
// 基づく採用中/未採用カタログ（左）＋観点詳細（右）の2ペイン構成に置き換える。
// progress_ux_phase1.md（WbsGanttPane/ProgressChart）・kpi_ux_phase1.md（KpiTree）と
// 同じ「page.tsxは薄いラッパー、この1ファイルがローカル状態を持つオーケストレータ」の形。
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
  const { show } = useToast();

  const adopted = adoptedAspects(nodes);
  // 選択中の観点が採用解除された・まだ何も選んでいない場合は、採用中の先頭にフォールバックする
  // （KpiTreeのnodes.find(...) ?? nodes[0]と同じ考え方）。
  const selectedAspect = adopted.find((n) => n.id === selectedId) ?? adopted[0] ?? null;

  function handleAdoptMaster(masterId: string, name: string) {
    startTransition(async () => {
      try {
        const newId = await adoptMasterAspect(projectId, tenantId, masterId, name);
        setSelectedId(newId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleReactivate(aspectId: string) {
    startTransition(async () => {
      try {
        await reactivateAspect(aspectId, projectId);
        setSelectedId(aspectId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleCreateCustom(name: string) {
    startTransition(async () => {
      try {
        const newId = await createCustomAspect(projectId, tenantId, name);
        setSelectedId(newId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleReorderAspect(aspectId: string, insertBeforeAspectId: string | null) {
    startTransition(async () => {
      try {
        await reorderAspect(projectId, aspectId, insertBeforeAspectId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-0 border border-border rounded-lg overflow-hidden items-stretch"
      style={{ background: "var(--bg-page)" }}
    >
      <AspectCatalogPane
        master={master}
        nodes={nodes}
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
        nodes={nodes}
        selectedAspect={selectedAspect}
        onUnadopted={() => setSelectedId(null)}
      />
    </div>
  );
}
