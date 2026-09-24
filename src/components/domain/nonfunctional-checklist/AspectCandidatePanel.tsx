"use client";

import { useState, useTransition } from "react";
import { addCheckItem, suggestNonfunctionalCandidates } from "@/actions/nonfunctional";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

type Candidate = { text: string; why: string };

// nonfunctional_ux_phase3.md：KPI画面のAI候補パネル（KpiCandidatePanel.tsx）と同じ構成
// （生成ボタン・スケルトン・候補カード・すべて採用・別の案を出す）。候補はDBに永続化せず、
// 画面表示中だけ保持する一時的な状態（新しいテーブルは作らない）。呼び出し元の
// AspectDetailPane側でkey={selectedAspect.id}を付けて観点切替時に自身ごと再マウントされる
// ため、ここでは候補状態のリセットを個別に持つ必要が無い（KpiCandidatePanelと同じ考え方）。
export function AspectCandidatePanel({
  projectId,
  tenantId,
  aspectId,
}: {
  projectId: string;
  tenantId: string;
  aspectId: string;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function generate(excludeTexts: string[]) {
    setGenerating(true);
    startTransition(async () => {
      try {
        const result = await suggestNonfunctionalCandidates(aspectId, projectId, excludeTexts);
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
        await addCheckItem(aspectId, projectId, tenantId, candidate.text, "ai");
        setCandidates((prev) => prev.filter((c) => c !== candidate));
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
        for (const candidate of candidates) {
          await addCheckItem(aspectId, projectId, tenantId, candidate.text, "ai");
        }
        setCandidates([]);
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
          <p className="text-[11px] text-faint">選択中の観点の方針と他章の確定済み内容を参照してチェック項目を提案します</p>
        </div>
        <Button variant="primary" size="sm" disabled={isPending} onClick={() => generate([])}>
          チェック項目候補を出す
        </Button>
      </div>

      {generating ? (
        <div className="flex flex-col gap-2">
          <div className="h-11 rounded-md animate-pulse" style={{ background: "var(--border)" }} />
          <div className="h-11 rounded-md animate-pulse" style={{ background: "var(--border)" }} />
          <p className="text-[11px] text-faint">チェック項目候補を生成中…</p>
        </div>
      ) : (
        <>
          {candidates.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {candidates.map((c, i) => (
                <div
                  key={i}
                  data-nonfunctional-candidate={c.text}
                  className="border rounded-md p-3 flex items-start gap-3"
                  style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}
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
            <p className="text-xs text-faint">「チェック項目候補を出す」を押すと、この観点の方針をもとにした候補が表示されます。</p>
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
              <Button variant="secondary" size="sm" disabled={isPending} onClick={() => generate(candidates.map((c) => c.text))}>
                別の案を出す
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
