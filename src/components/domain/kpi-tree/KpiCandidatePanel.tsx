"use client";

import { useState, useTransition } from "react";
import { suggestKpiCandidates, adoptKpiCandidate, type KpiNode } from "@/actions/kpi-tree";
import { KPI_LEVELS, type KpiLevel } from "@/lib/kpi-levels";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

function childLevelLabel(level: KpiLevel): string {
  const idx = KPI_LEVELS.indexOf(level);
  return idx < KPI_LEVELS.length - 1 ? KPI_LEVELS[idx + 1] : "測定指標";
}

type Candidate = { text: string; why: string };

// kpi_ux_phase3.md：候補はDBに永続化せず、この画面表示中だけ保持する一時的な状態にする
// （新しいテーブルは作らない、との指示書の方針）。呼び出し元のKpiDetailPane側で
// key={selectedNode.id}を付けてこのコンポーネントごと再マウントさせることで、
// 選択ノードが変わるたびに候補状態を自然にリセットする（useEffectでの手動リセット不要）。
export function KpiCandidatePanel({
  projectId,
  tenantId,
  node,
  onAdopted,
}: {
  projectId: string;
  tenantId: string;
  node: KpiNode;
  onAdopted: (newNodeId: string | null) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  const label = childLevelLabel(node.content.level);

  function generate(excludeTexts: string[]) {
    setGenerating(true);
    startTransition(async () => {
      try {
        const result = await suggestKpiCandidates(node.id, projectId, excludeTexts);
        setCandidates(result);
        setHasGenerated(true);
      } catch (e) {
        show(errorMessage(e), "error");
      } finally {
        setGenerating(false);
      }
    });
  }

  function handleAdopt(candidate: Candidate) {
    startTransition(async () => {
      try {
        const newNodeId = await adoptKpiCandidate(node.id, projectId, tenantId, candidate.text);
        setCandidates((prev) => prev.filter((c) => c !== candidate));
        onAdopted(newNodeId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleReject(candidate: Candidate) {
    // 見送りはその場でリストから消すだけ。DBには何も記録しない（指示書の方針）。
    setCandidates((prev) => prev.filter((c) => c !== candidate));
  }

  function handleAdoptAll() {
    startTransition(async () => {
      try {
        let lastNewNodeId: string | null = null;
        for (const candidate of candidates) {
          lastNewNodeId = await adoptKpiCandidate(node.id, projectId, tenantId, candidate.text);
        }
        setCandidates([]);
        onAdopted(lastNewNodeId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-sidebar)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-primary">AI候補</h3>
          <p className="text-[11px] text-faint">選択中の{node.content.level}にひもづく{label}を提案します</p>
        </div>
        <Button variant="primary" size="sm" disabled={isPending} onClick={() => generate([])}>
          {label}候補を出す
        </Button>
      </div>

      {generating ? (
        <div className="flex flex-col gap-2">
          <div className="h-11 rounded-md animate-pulse" style={{ background: "var(--border)" }} />
          <div className="h-11 rounded-md animate-pulse" style={{ background: "var(--border)" }} />
          <p className="text-[11px] text-faint">{label}候補を生成中…</p>
        </div>
      ) : (
        <>
          {candidates.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {candidates.map((c, i) => (
                <div
                  key={i}
                  data-kpi-candidate={c.text}
                  className="border rounded-md p-3 flex items-start gap-3"
                  style={{ borderColor: "var(--border)", background: "#fff" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">{c.text}</p>
                    <p className="text-[11px] text-faint mt-1">根拠：{c.why}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-none">
                    <Button variant="primary" size="sm" disabled={isPending} onClick={() => handleAdopt(c)}>
                      採用
                    </Button>
                    <Button variant="secondary" size="sm" disabled={isPending} onClick={() => handleReject(c)}>
                      見送り
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!hasGenerated && (
            <p className="text-xs text-faint">
              「{label}候補を出す」を押すと、この{node.content.level}の内容をもとにした候補が表示されます。
            </p>
          )}
          {hasGenerated && candidates.length === 0 && (
            <p className="text-xs text-faint">候補はすべて処理済みです。「別の案を出す」で再度生成できます。</p>
          )}

          {hasGenerated && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {candidates.length > 0 && (
                <Button variant="secondary" size="sm" disabled={isPending} onClick={handleAdoptAll}>
                  すべて採用
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => generate(candidates.map((c) => c.text))}
              >
                別の案を出す
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
