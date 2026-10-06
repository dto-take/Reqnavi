"use client";

import { runAction } from "@/lib/run-action";
import { useState, useTransition } from "react";
import { suggestKpiCandidates, adoptKpiCandidate, type KpiNode } from "@/actions/kpi-tree";
import { KPI_LEVELS, type KpiLevel } from "@/lib/kpi-levels";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

function childLevelLabel(level: KpiLevel): string {
  const idx = KPI_LEVELS.indexOf(level);
  return idx < KPI_LEVELS.length - 1 ? KPI_LEVELS[idx + 1] : "測定指標";
}

type Candidate = { text: string; why: string };

// 候補の状態（ノードごと）。DBには永続化せず、この画面表示中だけ保持する一時的な状態にする
// （新しいテーブルは作らない、との指示書の方針）。ただし、ノードの選択が切り替わっても失われないよう、
// このコンポーネントの中ではなく、ツリー全体の状態（KpiTree）に、親ノードのidをキーとして持つ。
// （候補を1件採用すると、新しいノードが選択されてこのパネルが再マウントされる。以前は状態がここにあり、
// 残りの候補が消えて、Geminiの呼び出し1回分が失われていた）
export type NodeCandidates = { candidates: Candidate[]; hasGenerated: boolean };
export const EMPTY_NODE_CANDIDATES: NodeCandidates = { candidates: [], hasGenerated: false };

export function KpiCandidatePanel({
  projectId,
  tenantId,
  node,
  state,
  onStateChange,
  onAdopted,
}: {
  projectId: string;
  tenantId: string;
  node: KpiNode;
  state: NodeCandidates;
  // ノードidを閉じ込んだ更新関数（生成の完了が、別のノードを選んだあとに届いても、元のノードの候補として保存される）
  onStateChange: (updater: (prev: NodeCandidates) => NodeCandidates) => void;
  onAdopted: (newNodeId: string | null) => void;
}) {
  const candidates = state.candidates;
  const hasGenerated = state.hasGenerated;
  const setCandidates = (next: Candidate[] | ((prev: Candidate[]) => Candidate[])) =>
    onStateChange((prev) => ({ ...prev, candidates: typeof next === "function" ? next(prev.candidates) : next }));
  const setHasGenerated = (v: boolean) => onStateChange((prev) => ({ ...prev, hasGenerated: v }));
  const [generating, setGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  const label = childLevelLabel(node.content.level);

  function generate(excludeTexts: string[]) {
    setGenerating(true);
    startTransition(async () => {
      try {
        const r = await runAction(() => suggestKpiCandidates(node.id, projectId, excludeTexts), show);
        if (r) {
          setCandidates(r.data);
          setHasGenerated(true);
        }
      } finally {
        setGenerating(false);
      }
    });
  }

  function handleAdopt(candidate: Candidate) {
    startTransition(async () => {
      const r = await runAction(() => adoptKpiCandidate(node.id, projectId, tenantId, candidate.text), show);
      if (r) {
        setCandidates((prev) => prev.filter((c) => c !== candidate));
        onAdopted(r.data);
      }
    });
  }

  function handleReject(candidate: Candidate) {
    // 見送りはその場でリストから消すだけ。DBには何も記録しない（指示書の方針）。
    setCandidates((prev) => prev.filter((c) => c !== candidate));
  }

  function handleAdoptAll() {
    startTransition(async () => {
      let lastNewNodeId: string | null = null;
      for (const candidate of candidates) {
        const r = await runAction(() => adoptKpiCandidate(node.id, projectId, tenantId, candidate.text), show);
        if (!r) return; // 失敗はトースト表示済み。以降の候補は採用せず中断する
        lastNewNodeId = r.data;
      }
      setCandidates([]);
      onAdopted(lastNewNodeId);
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
