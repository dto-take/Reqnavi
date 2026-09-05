"use client";

import { useTransition } from "react";
import {
  updateChecklistContent,
  type ChecklistCategoryRow,
  type ChecklistItem,
  type ChecklistContent,
} from "@/actions/nonfunctional-checklist";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGlobalPending } from "@/components/ui/loading-overlay";

const STATUS_CYCLE: ChecklistItem["status"][] = ["未", "済", "対象外"];

export function ChecklistCard({ projectId, row }: { projectId: string; row: ChecklistCategoryRow }) {
  const [isPending, startTransition] = useTransition();
  useGlobalPending(isPending);
  const { content } = row;

  function save(next: ChecklistContent) {
    startTransition(() => updateChecklistContent(row.id, projectId, next));
  }

  function cycleStatus(index: number) {
    const items = [...content.checklist];
    const current = items[index].status;
    const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
    items[index] = { ...items[index], status: STATUS_CYCLE[nextIdx] };
    save({ ...content, checklist: items });
  }

  function addItem() {
    save({ ...content, checklist: [...content.checklist, { item: "", status: "未" }] });
  }

  function removeItem(index: number) {
    save({ ...content, checklist: content.checklist.filter((_, i) => i !== index) });
  }

  return (
    <div className="border border-border rounded-lg p-4 mb-3">
      <div className="text-sm font-semibold text-primary mb-2">{content.category}</div>
      <Textarea
        defaultValue={content.overview}
        onBlur={(e) => save({ ...content, overview: e.target.value })}
        placeholder="概要"
        className="w-full mb-2"
        rows={2}
      />
      {content.checklist.map((c, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <Input
            defaultValue={c.item}
            onBlur={(e) => {
              const items = [...content.checklist];
              items[i] = { ...items[i], item: e.target.value };
              save({ ...content, checklist: items });
            }}
            className="flex-1"
            placeholder="チェック項目"
          />
          {/* ステータス切替チップは常時塗りのトグル表現のため、共通Buttonのvariantとは別扱い */}
          <button
            disabled={isPending}
            onClick={() => cycleStatus(i)}
            className="text-xs px-2 py-0.5 rounded bg-hover text-secondary w-14 disabled:opacity-50"
          >
            {c.status}
          </button>
          <Button variant="ghost" size="sm" disabled={isPending} onClick={() => removeItem(i)}>
            削除
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="mt-1" onClick={addItem}>
        + 項目を追加
      </Button>
    </div>
  );
}
