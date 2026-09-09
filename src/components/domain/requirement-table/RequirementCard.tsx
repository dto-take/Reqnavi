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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { isItemLocked } from "@/lib/item-lock";
import { errorMessage } from "@/lib/error-message";
import { highlightAmbiguousPhrases } from "@/lib/highlight-ambiguous";
import { pickBodyColumnKey } from "@/lib/requirement-body-field";

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
  selected,
  onToggleSelect,
  dragEnabled = true,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
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
  selected: boolean;
  onToggleSelect: () => void;
  // フェーズ4：グループ軸が「要件区分」以外のときはドラッグ並び替えを無効化する
  // （手動並び順が意味を持つのは要件区分軸のときのみ、との指示書の設計判断）。
  dragEnabled?: boolean;
  // フェーズ5：ドラッグが困難な利用者向けの代替手段（⋯メニューの「上へ／下へ移動」）。
  // dragEnabledがfalseのとき（要件区分軸以外）はメニュー自体から非表示にする。
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const locked = isItemLocked(item.status);
  const [expanded, setExpanded] = useState(!locked);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [suggesting, setSuggesting] = useState(false);
  const { show } = useToast();

  // テンプレートA/B/Cで列名が異なるため、内容のある列を優先して「本文」を選ぶ
  // （pickBodyColumnKeyに一本化。旧実装の「先頭列＝本文」だと、テンプレートCで
  // グループ見出しと重複する短い分類名「区分・分類」が本文になってしまっていた）。
  // 選ばれた本文列は項目サマリからは除外し、categoryは本文候補から除外した上で
  // バッジ行に小さなタグとして残す（fix_card_body_field.md Step2）。
  const bodyColumnKey = pickBodyColumnKey(columns.map((c) => c.column_key));
  const bodyColumn = columns.find((c) => c.column_key === bodyColumnKey) ?? null;
  const summaryColumns = columns.filter((c) => c.column_key !== bodyColumnKey && c.column_key !== "category");
  const categoryValue = item.content.category?.trim() || null;
  const bodyValue = bodyColumn ? (item.content[bodyColumn.column_key] ?? "") : "";
  const filledCount = columns.filter((c) => (item.content[c.column_key] ?? "").trim() !== "").length;

  // フェーズ5：曖昧表現のインライン表示。「本文表示部分」（bodyColumn）に対応する
  // フラグのみを対象にする（他フィールドのフラグの文字列がたまたま本文中に含まれていても
  // 誤ってハイライトしないため）。fix_card_body_field.mdでbodyColumnがpickBodyColumnKey
  // により内容のある列（テンプレートCなら「内容」等）を優先して選ばれるようになったため、
  // 実際に曖昧な言い回しが出現しやすい列に対してインライン表示が機能するようになった
  // （フェーズ5時点では先頭列＝categoryが選ばれておりインライン表示の対象外だった）。
  // それでも本文以外に選ばれた列のフラグは項目サマリの<textarea>内では<mark>を描画
  // できないため対象外のまま（バッジ表示のみ）。
  // phraseを持たないフラグ（extraction由来等）はhighlightAmbiguousPhrases側で自動的に
  // 無視され、従来通りバッジのみの表示にフォールバックする（やってはいけないこと：無理に
  // インライン表示を試みてエラーにしない、への対応）。
  const bodyAmbiguousFlags = bodyColumn
    ? (item.ambiguous_flags ?? []).filter((f) => f.field === bodyColumn.column_key && f.phrase)
    : [];
  const { segments: bodySegments } = highlightAmbiguousPhrases(bodyValue, bodyAmbiguousFlags);
  const hasBodyHighlight = bodySegments.some((s) => s.isAmbiguous);
  // 本文はデフォルトで編集可能な<textarea>だが、<textarea>内にインライン要素（<mark>）は
  // 描画できない。ハイライト対象がある場合のみ、クリックで編集に切り替わる読み取り専用の
  // 表示に切り替える（ロック済み項目はそもそも編集不可なので常に表示専用でよい）。
  const [bodyEditing, setBodyEditing] = useState(false);
  const showBodyHighlightView = hasBodyHighlight && (locked || !bodyEditing);
  const [activeAmbiguousReason, setActiveAmbiguousReason] = useState<string | null>(null);

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
          <Checkbox checked={selected} onChange={onToggleSelect} ariaLabel="この項目を選択" />
          {dragEnabled && (
            <span
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              className="cursor-grab text-faint flex-none"
              title="ドラッグして並び替え"
            >
              ⠿
            </span>
          )}
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
          <div className="flex flex-col items-center gap-2.5 flex-none pt-0.5">
            <Checkbox checked={selected} onChange={onToggleSelect} ariaLabel="この項目を選択" />
            {dragEnabled && (
              <span
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                className="cursor-grab text-faint"
                title="ドラッグして並び替え"
              >
                ⠿
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* バッジ行 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={item.status} />
              {categoryValue && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-faint">{categoryValue}</span>
              )}
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

            {/* 本文（pickBodyColumnKeyで選ばれた、内容のある列） */}
            {bodyColumn && (
              showBodyHighlightView ? (
                <div
                  onClick={() => {
                    if (!locked) setBodyEditing(true);
                  }}
                  className={`text-sm leading-relaxed whitespace-pre-wrap ${locked ? "" : "cursor-text"}`}
                >
                  {bodyValue === "" && <span className="text-faint">（未入力）</span>}
                  {bodySegments.map((seg, i) =>
                    seg.isAmbiguous ? (
                      <mark
                        key={i}
                        title={seg.reason}
                        className="bg-[#FBEAE5] border-b-2 border-[#CF7F66] cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveAmbiguousReason(seg.reason ?? null);
                        }}
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  )}
                </div>
              ) : (
                <Textarea
                  variant="bare"
                  rows={1}
                  ref={(el: HTMLTextAreaElement | null) => {
                    if (el) autoGrowTextarea(el);
                  }}
                  defaultValue={bodyValue}
                  autoFocus={hasBodyHighlight && bodyEditing}
                  onBlur={(e) => {
                    handleContentChange(bodyColumn.column_key, e.target.value);
                    if (hasBodyHighlight) setBodyEditing(false);
                  }}
                  onInput={(e) => autoGrowTextarea(e.currentTarget)}
                  disabled={locked}
                  className="resize-none overflow-hidden text-sm leading-relaxed px-0"
                />
              )
            )}
            {activeAmbiguousReason && (
              <p
                className="text-xs px-2.5 py-1.5 rounded-md"
                style={{ background: "var(--status-needhearing-bg)", color: "var(--status-needhearing-text)" }}
              >
                {activeAmbiguousReason}
              </p>
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
                {dragEnabled && (
                  <MenuItem onClick={onMoveUp} disabled={!canMoveUp}>
                    上へ移動
                  </MenuItem>
                )}
                {dragEnabled && (
                  <MenuItem onClick={onMoveDown} disabled={!canMoveDown}>
                    下へ移動
                  </MenuItem>
                )}
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
