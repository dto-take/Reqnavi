"use client";

import { useState, useTransition } from "react";
import {
  updateRequirementItemContent,
  updateRequirementItemStatus,
  markAsExceptionApproved,
  markAsRejected,
  deleteRequirementItem,
  reorderRequirementItems,
  type ColumnDef,
  type RequirementItem,
} from "@/actions/requirement-items";
import { suggestPlatformFeature } from "@/actions/platform-suggestion";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { isItemLocked } from "@/lib/item-lock";
import { errorMessage } from "@/lib/error-message";

// 表形式（テンプレートA/B/C）のセルは、内容が枠幅を超えた場合に横スクロールで隠れるのではなく
// 折り返して見えるようにしたい。<input>は仕様上折り返せないため<textarea>を使い、
// 内容量に応じて高さを自動調整する（複数行になった分だけ行が伸びる）
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function RequirementTable({
  projectId,
  chapterNo,
  columns,
  items,
  showPlatformSuggestion = false,
}: {
  projectId: string;
  chapterNo: number;
  columns: ColumnDef[];
  items: RequirementItem[];
  showPlatformSuggestion?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [exceptionReasonDraft, setExceptionReasonDraft] = useState<Record<string, string>>({});
  const [openExceptionFor, setOpenExceptionFor] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [suggestingItemId, setSuggestingItemId] = useState<string | null>(null);
  const { show } = useToast();
  const actionsColumnWidth = showPlatformSuggestion ? "140px" : "80px";
  // 「内容」等、文字数が多くなりやすい列（width_hint = 'wide'）は2fr、それ以外は1frで幅を配分する。
  // 先頭の24pxはドラッグハンドル用の列（ヘッダー行・データ行で列数・幅を必ず一致させる）。
  const gridTemplate = "24px " + columns.map((c) => (c.width_hint === "wide" ? "2fr" : "1fr")).join(" ") + ` 100px ${actionsColumnWidth}`;

  function handleDragStart(e: React.DragEvent, itemId: string) {
    e.dataTransfer.setData("text/plain", itemId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(itemId);
  }

  function handleDragOver(e: React.DragEvent, itemId: string) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? "before" : "after";
    setDropTarget({ id: itemId, position });
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDropTarget(null);
  }

  function handleDrop(e: React.DragEvent, targetItemId: string) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    const position = dropTarget?.position ?? "before";
    setDraggedId(null);
    setDropTarget(null);
    if (!sourceId || sourceId === targetItemId) return;

    const currentOrder = items.map((i) => i.id);
    const sourceIndex = currentOrder.indexOf(sourceId);
    if (sourceIndex === -1) return;

    const withoutSource = currentOrder.filter((id) => id !== sourceId);
    const targetIndex = withoutSource.indexOf(targetItemId);
    if (targetIndex === -1) return;

    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    const reordered = [...withoutSource];
    reordered.splice(insertIndex, 0, sourceId);

    startTransition(async () => {
      try {
        await reorderRequirementItems(projectId, chapterNo, reordered);
        show("順序を更新しました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleContentChange(item: RequirementItem, key: string, value: string) {
    const nextContent = { ...item.content, [key]: value };
    startTransition(async () => {
      try {
        await updateRequirementItemContent(item.id, projectId, chapterNo, nextContent);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleConfirm(item: RequirementItem) {
    startTransition(async () => {
      try {
        await updateRequirementItemStatus(item.id, projectId, chapterNo, "confirmed");
        show("確定しました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleExceptionApprove(item: RequirementItem) {
    const reason = exceptionReasonDraft[item.id]?.trim();
    if (!reason) return;
    startTransition(async () => {
      try {
        await markAsExceptionApproved(item.id, projectId, chapterNo, reason);
        setOpenExceptionFor(null);
        show("リスク許容で確定しました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleReject(item: RequirementItem) {
    startTransition(async () => {
      try {
        await markAsRejected(item.id, projectId, chapterNo);
        show("不採用にしました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleDelete(item: RequirementItem) {
    if (!confirm("この項目を削除しますか？この操作は取り消せません。")) return;
    startTransition(async () => {
      try {
        await deleteRequirementItem(item.id, projectId, chapterNo);
        show("削除しました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleSuggest(item: RequirementItem) {
    setSuggestingItemId(item.id);
    startTransition(async () => {
      const result = await suggestPlatformFeature(item.id, projectId, chapterNo);
      setSuggestingItemId(null);
      show(result.error ?? "提案を反映しました", result.error ? "error" : "success");
    });
  }

  if (items.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg py-10 text-center">
        <p className="text-sm text-secondary mb-3">まだこの章に項目がありません</p>
        <p className="text-xs text-faint">「AI素案を生成」または「+ 行を追加」から始めてください</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="grid bg-sidebar text-xs text-secondary"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="px-3 py-2"></div>
        {columns.map((c) => (
          <div key={c.column_key} className="px-3 py-2">{c.label}</div>
        ))}
        <div className="px-3 py-2">ステータス</div>
        <div className="px-3 py-2"></div>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDrop={(e) => handleDrop(e, item.id)}
          className={`grid border-t border-hover relative ${draggedId === item.id ? "opacity-40" : ""}`}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {dropTarget?.id === item.id && (
            <div
              className={`absolute left-0 right-0 h-0.5 bg-brand pointer-events-none ${
                dropTarget.position === "before" ? "top-0" : "bottom-0"
              }`}
            />
          )}
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            className="flex items-center justify-center cursor-grab text-faint"
            title="ドラッグして並び替え"
          >
            ⠿
          </div>
          {columns.map((c) => (
            <Textarea
              key={c.column_key}
              variant="bare"
              rows={1}
              ref={(el: HTMLTextAreaElement | null) => {
                if (el) autoGrowTextarea(el);
              }}
              defaultValue={item.content[c.column_key] ?? ""}
              onBlur={(e) => handleContentChange(item, c.column_key, e.target.value)}
              onInput={(e) => autoGrowTextarea(e.currentTarget)}
              disabled={isItemLocked(item.status)}
              className="resize-none overflow-hidden"
            />
          ))}
          <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={item.status} />
            {item.confidence === "inferred" && (
              <span title="資料からの推測に基づく内容です" className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-faint">
                推測
              </span>
            )}
            {item.sources.length > 0 && (
              <span
                title={item.sources.map((s) => `${s.fileName}${s.locationNote ? `（${s.locationNote}）` : ""}`).join(", ")}
                className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-faint cursor-help"
              >
                出典 {item.sources.length}件
              </span>
            )}
            {item.status === "exception_approved" && item.exception_reason && (
              <span title={item.exception_reason} className="text-xs text-faint cursor-help">ⓘ</span>
            )}
            {item.ambiguous_flags?.length > 0 && (
              <span
                title={item.ambiguous_flags
                  .map((f) =>
                    f.source === "dictionary" ? `[辞書] ${f.field}: 「${f.phrase}」`
                    : f.source === "ai" ? `[AI] ${f.field}: ${f.reason}`
                    : `[素案生成時] ${f.reason}`
                  )
                  .join(", ")}
                className="text-xs text-(--status-review-text)"
              >
                ⚠ {item.ambiguous_flags.length}
              </span>
            )}
          </div>
          <div className="px-3 py-2 flex flex-col items-start gap-1">
            {!isItemLocked(item.status) && (
              <>
                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => handleConfirm(item)}>
                  確定
                </Button>
                {openExceptionFor === item.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="リスク許容の理由"
                      value={exceptionReasonDraft[item.id] ?? ""}
                      onChange={(e) => setExceptionReasonDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="w-32"
                    />
                    <Button
                      variant="accent"
                      size="sm"
                      disabled={isPending || !exceptionReasonDraft[item.id]?.trim()}
                      onClick={() => handleExceptionApprove(item)}
                    >
                      確定する
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setOpenExceptionFor(item.id)}>
                    リスク許容で確定
                  </Button>
                )}
              </>
            )}
            {showPlatformSuggestion && !isItemLocked(item.status) && (
              <Button variant="ghost" size="sm" disabled={isPending} onClick={() => handleSuggest(item)}>
                {suggestingItemId === item.id ? (
                  <span className="flex items-center gap-1">
                    <Spinner className="w-3 h-3" /> 提案作成中...
                  </span>
                ) : (
                  "Salesforce機能を提案"
                )}
              </Button>
            )}
            {!isItemLocked(item.status) && (
              <button
                disabled={isPending}
                onClick={() => handleReject(item)}
                className="text-xs text-faint underline"
              >
                不採用にする
              </button>
            )}
            <button
              disabled={isPending}
              onClick={() => handleDelete(item)}
              className="text-xs text-[#A23B2E] underline"
            >
              削除
            </button>
            <a
              href={`/projects/${projectId}/chapters/${chapterNo}/consistency?item_id=${item.id}`}
              className="text-xs text-faint underline"
            >
              この項目を確認
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
