"use client";

import { useState, useTransition } from "react";
import {
  updateRequirementItemContent,
  updateRequirementItemStatus,
  markAsExceptionApproved,
  markAsRejected,
  deleteRequirementItem,
  type ColumnDef,
  type RequirementItem,
} from "@/actions/requirement-items";
import { suggestPlatformFeature } from "@/actions/platform-suggestion";
import { StatusBadge, STATUS_MAP } from "@/components/ui/status-badge";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { isItemLocked } from "@/lib/item-lock";
import { errorMessage } from "@/lib/error-message";

// 「内容」等、文字数が多くなりやすいセルは横スクロールで隠れるのではなく折り返して見えて
// ほしい。<input>は仕様上折り返せないため<textarea>を使い、内容量に応じて高さを自動調整する。
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

export function RequirementCard({
  item,
  columns,
  projectId,
  chapterNo,
  showPlatformSuggestion,
  isDragging,
  dropPosition,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  item: RequirementItem;
  columns: ColumnDef[];
  projectId: string;
  chapterNo: number;
  showPlatformSuggestion: boolean;
  isDragging: boolean;
  dropPosition: "before" | "after" | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const locked = isItemLocked(item.status);
  const [expanded, setExpanded] = useState(!locked);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [suggesting, setSuggesting] = useState(false);
  const { show } = useToast();

  // テンプレートA/B/Cで列名が異なるため、先頭列（listColumnDefsのorder_index最小）を
  // 「本文」、残りを「項目サマリ」として汎用的に扱う（テンプレートA固有の列名はハードコードしない）。
  const [bodyColumn, ...summaryColumns] = columns;
  const bodyValue = bodyColumn ? (item.content[bodyColumn.column_key] ?? "") : "";
  const filledCount = columns.filter((c) => (item.content[c.column_key] ?? "").trim() !== "").length;

  function handleContentChange(key: string, value: string) {
    const nextContent = { ...item.content, [key]: value };
    startTransition(async () => {
      try {
        await updateRequirementItemContent(item.id, projectId, chapterNo, nextContent);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        await updateRequirementItemStatus(item.id, projectId, chapterNo, "confirmed");
        show("確定しました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleExceptionApprove() {
    const reason = exceptionReason.trim();
    if (!reason) return;
    startTransition(async () => {
      try {
        await markAsExceptionApproved(item.id, projectId, chapterNo, reason);
        setExceptionOpen(false);
        show("リスク許容で確定しました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await markAsRejected(item.id, projectId, chapterNo);
        show("不採用にしました");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleDelete() {
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

  function handleSuggest() {
    setSuggesting(true);
    startTransition(async () => {
      const result = await suggestPlatformFeature(item.id, projectId, chapterNo);
      setSuggesting(false);
      show(result.error ?? "提案を反映しました", result.error ? "error" : "success");
    });
  }

  const accentColor = STATUS_MAP[item.status]?.text ?? "var(--status-draft-text)";
  const metaText = item.updatedByName
    ? `更新 ${formatRelativeTime(item.updatedAt)} ・ ${item.updatedByName}`
    : `更新 ${formatRelativeTime(item.updatedAt)}`;

  return (
    <div
      data-item-card={item.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative rounded-xl border bg-page overflow-hidden ${isDragging ? "opacity-40" : ""}`}
      style={{ borderColor: "var(--border)", borderLeftWidth: 4, borderLeftColor: accentColor }}
    >
      {dropPosition && (
        <div
          className={`absolute left-0 right-0 h-0.5 bg-brand pointer-events-none ${
            dropPosition === "before" ? "top-0" : "bottom-0"
          }`}
        />
      )}

      {/* 1行形：確定済・不採用等のロック状態の既定表示（簡略表示、クリックで展開） */}
      {locked && !expanded ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="cursor-grab text-faint flex-none"
            title="ドラッグして並び替え"
          >
            ⠿
          </span>
          <span className="text-sm text-secondary truncate flex-1 min-w-0">{bodyValue || "（未入力）"}</span>
          <span className="font-mono text-xs text-faint flex-none">
            {filledCount}/{columns.length}
          </span>
          <StatusBadge status={item.status} />
          <Button variant="secondary" size="sm" onClick={() => setExpanded(true)}>
            開く
          </Button>
        </div>
      ) : (
        <div className="flex gap-3 px-4 py-4">
          <span
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="cursor-grab text-faint flex-none pt-0.5"
            title="ドラッグして並び替え"
          >
            ⠿
          </span>

          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* バッジ行 */}
            <div className="flex items-center gap-1.5 flex-wrap">
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
                <span title={item.exception_reason} className="text-xs text-faint cursor-help">
                  ⓘ
                </span>
              )}
              {item.ambiguous_flags?.length > 0 && (
                <span
                  title={item.ambiguous_flags
                    .map((f) =>
                      f.source === "dictionary"
                        ? `[辞書] ${f.field}: 「${f.phrase}」`
                        : f.source === "ai"
                          ? `[AI] ${f.field}: ${f.reason}`
                          : `[素案生成時] ${f.reason}`
                    )
                    .join(", ")}
                  className="text-[10px] px-1.5 py-0.5 rounded cursor-help"
                  style={{ background: "var(--status-needhearing-bg)", color: "var(--status-needhearing-text)" }}
                >
                  ⚠ 曖昧表現 {item.ambiguous_flags.length}件
                </span>
              )}
              {/* 相対時刻はDate.now()基準でサーバー描画時とクライアントhydration時とで
                  値がずれ得るため、ハイドレーションミスマッチ警告を抑止する
                  （React公式が推奨する対処：https://react.dev/link/hydration-mismatch） */}
              <span suppressHydrationWarning className="font-mono text-[10px] text-faint ml-auto whitespace-nowrap">
                {metaText}
              </span>
              {locked && (
                <Button variant="secondary" size="sm" onClick={() => setExpanded(false)}>
                  閉じる
                </Button>
              )}
            </div>

            {/* 本文（先頭列） */}
            {bodyColumn && (
              <Textarea
                variant="bare"
                rows={1}
                ref={(el: HTMLTextAreaElement | null) => {
                  if (el) autoGrowTextarea(el);
                }}
                defaultValue={bodyValue}
                onBlur={(e) => handleContentChange(bodyColumn.column_key, e.target.value)}
                onInput={(e) => autoGrowTextarea(e.currentTarget)}
                disabled={locked}
                className="resize-none overflow-hidden text-sm leading-relaxed px-0"
              />
            )}

            {/* 項目サマリ（残りの列。テンプレート非依存で動的に列挙） */}
            {summaryColumns.length > 0 && (
              <div className="grid gap-3 pt-2 border-t border-hover" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                {summaryColumns.map((c) => {
                  const value = item.content[c.column_key] ?? "";
                  return (
                    <div key={c.column_key} className="flex flex-col gap-1 min-w-0">
                      <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">{c.label}</label>
                      <Textarea
                        variant="bare"
                        rows={1}
                        ref={(el: HTMLTextAreaElement | null) => {
                          if (el) autoGrowTextarea(el);
                        }}
                        defaultValue={value}
                        onBlur={(e) => handleContentChange(c.column_key, e.target.value)}
                        onInput={(e) => autoGrowTextarea(e.currentTarget)}
                        disabled={locked}
                        placeholder="＋ 未入力"
                        className={`resize-none overflow-hidden text-sm rounded-md px-2 py-1.5 ${
                          value ? "" : "border border-dashed border-border text-faint"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* アクション行 */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {!locked && (
                <Button variant="primary" size="sm" disabled={isPending} onClick={handleConfirm}>
                  確定する
                </Button>
              )}
              {locked && item.status === "confirmed" && (
                <span
                  suppressHydrationWarning
                  className="text-xs px-3 py-1.5 rounded-md"
                  style={{ background: "var(--status-confirmed-bg)", color: "var(--status-confirmed-text)" }}
                >
                  ✓ 確定済（{formatRelativeTime(item.updatedAt)}）
                </span>
              )}
              {showPlatformSuggestion && !locked && (
                <Button variant="secondary" size="sm" disabled={isPending} onClick={handleSuggest}>
                  {suggesting ? (
                    <span className="flex items-center gap-1">
                      <Spinner className="w-3 h-3" /> 提案作成中...
                    </span>
                  ) : (
                    "Salesforce機能を提案"
                  )}
                </Button>
              )}

              <Menu
                trigger={({ onClick }) => (
                  <Button variant="secondary" size="sm" onClick={onClick} disabled={isPending}>
                    ⋯
                  </Button>
                )}
              >
                {!locked && (
                  <MenuItem onClick={() => setExceptionOpen(true)}>リスク許容で確定</MenuItem>
                )}
                {!locked && <MenuItem onClick={handleReject}>不採用にする</MenuItem>}
                <MenuItem href={`/projects/${projectId}/chapters/${chapterNo}/consistency?item_id=${item.id}`}>
                  この項目を確認
                </MenuItem>
                <MenuItem onClick={handleDelete} danger>
                  削除
                </MenuItem>
              </Menu>

              {exceptionOpen && (
                <div className="flex items-center gap-1.5 w-full mt-1">
                  <Input
                    placeholder="リスク許容の理由"
                    value={exceptionReason}
                    onChange={(e) => setExceptionReason(e.target.value)}
                    className="flex-1 min-w-0"
                  />
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={isPending || !exceptionReason.trim()}
                    onClick={handleExceptionApprove}
                  >
                    確定する
                  </Button>
                  <button type="button" onClick={() => setExceptionOpen(false)} className="text-xs text-faint underline">
                    キャンセル
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
