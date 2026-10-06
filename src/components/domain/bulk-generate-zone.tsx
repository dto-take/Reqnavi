"use client";

import { useState, useTransition } from "react";
import { generateDraft } from "@/actions/ai-draft";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";
import { Spinner } from "@/components/ui/spinner";

type ChapterOption = { chapterNo: number; chapterName: string; templateType: "A" | "B" | "C" };
type QueueStatus = "unselected" | "pending" | "generating" | "done" | "error";

export function BulkGenerateZone({
  projectId,
  tenantId,
  chapters,
}: {
  projectId: string;
  tenantId: string;
  chapters: ChapterOption[];
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(chapters.map((c) => c.chapterNo)));
  const [statuses, setStatuses] = useState<Record<number, { status: QueueStatus; error?: string }>>({});
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function toggle(chapterNo: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chapterNo)) next.delete(chapterNo);
      else next.add(chapterNo);
      return next;
    });
  }

  function startGeneration() {
    const targets = chapters.filter((c) => selected.has(c.chapterNo));
    // 確認文は generateDraft の実際の挙動（ai_draft の項目のみ削除して再生成。それ以外のステータスは保持）と一致させる
    if (
      !confirm(
        `選択した${targets.length}章のAI素案を生成します。

・「AI素案（未確認）」のままの項目は削除され、新しい素案に置き換わります。
・「確認中」「確定」「例外承認」「不採用」の項目は上書きされず、そのまま残ります。

よろしいですか？`
      )
    )
      return;
    setStatuses(Object.fromEntries(targets.map((c) => [c.chapterNo, { status: "pending" as const }])));

    startTransition(async () => {
      let successCount = 0;
      let errorCount = 0;
      for (const chapter of targets) {
        setStatuses((s) => ({ ...s, [chapter.chapterNo]: { status: "generating" } }));
        // generateDraftはuseActionState向けのシグネチャ（末尾にprevState・formDataを取り、
        // 失敗してもthrowせず{error: string}を返す設計。documents.tsのuploadDocumentと同様の
        // 理由：Server Action境界を越える際のエラーメッセージ欠落を避けるため）。
        // 通信断（Actionの呼び出し自体の例外）は、その章の失敗として日本語で表示し、次の章へ進む
        let result: { error: string | null };
        try {
          result = await generateDraft(projectId, tenantId, chapter.chapterNo, chapter.templateType, { error: null }, new FormData());
        } catch (e) {
          result = { error: errorMessage(e) };
        }
        if (result.error) {
          setStatuses((s) => ({ ...s, [chapter.chapterNo]: { status: "error", error: result.error ?? undefined } }));
          errorCount++;
        } else {
          setStatuses((s) => ({ ...s, [chapter.chapterNo]: { status: "done" } }));
          successCount++;
        }
      }
      show(
        `${successCount}章の素案生成が完了しました${errorCount > 0 ? `（失敗${errorCount}章）` : ""}`,
        errorCount > 0 ? "error" : "success"
      );
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-1 mb-4">
        {chapters.map((c) => {
          const status = statuses[c.chapterNo]?.status ?? "unselected";
          return (
            <label key={c.chapterNo} className="flex items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={selected.has(c.chapterNo)}
                onChange={() => toggle(c.chapterNo)}
                disabled={isPending}
              />
              <span className="flex-1">{c.chapterNo}. {c.chapterName}</span>
              {status === "generating" && <Spinner />}
              {status === "done" && <span className="text-xs text-brand">完了</span>}
              {status === "error" && (
                <span className="text-xs text-[#A23B2E]" title={statuses[c.chapterNo]?.error}>
                  失敗
                </span>
              )}
            </label>
          );
        })}
      </div>
      <button
        disabled={isPending || selected.size === 0}
        onClick={startGeneration}
        className="h-9 px-4 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-50"
      >
        {isPending ? "生成中..." : `選択した${selected.size}章の素案を生成`}
      </button>
    </div>
  );
}
