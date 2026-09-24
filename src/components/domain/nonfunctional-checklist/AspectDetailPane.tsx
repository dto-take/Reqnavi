"use client";

import { useState, useTransition } from "react";
import {
  addCheckItem,
  deleteCheckItem,
  importMasterCheckItems,
  setCheckItemJudgement,
  unadoptAspect,
  updateAspectPolicy,
  type AspectMaster,
  type CheckItemContent,
  type NonfunctionalNode,
} from "@/actions/nonfunctional";
import { aspectContent, aspectStats, checkItemContent, checkItemsOf, type AspectStats } from "@/lib/nonfunctional/derive";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

const JUDGEMENT_LABEL: Record<CheckItemContent["judgement"], string> = { yes: "該当", no: "非該当", unknown: "未判定" };

function statusPill(node: NonfunctionalNode, stats: AspectStats) {
  if (node.status === "confirmed" || node.status === "exception_approved") {
    return { label: "✓ 確定済", bg: "var(--status-confirmed-bg)", fg: "var(--status-confirmed-text)", border: "var(--status-confirmed-text)" };
  }
  if (stats.unknown > 0) {
    return { label: `未判定 ${stats.unknown}`, bg: "var(--status-review-bg)", fg: "var(--status-review-text)", border: "var(--status-review-text)" };
  }
  return { label: "判定完了", bg: "var(--bg-page)", fg: "var(--text-secondary)", border: "var(--border)" };
}

function segmentStyle(active: boolean, kind: CheckItemContent["judgement"]) {
  if (!active) return { background: "var(--bg-page)", color: "var(--text-secondary)", borderColor: "var(--border)" };
  if (kind === "yes") return { background: "var(--status-confirmed-bg)", color: "var(--status-confirmed-text)", borderColor: "var(--status-confirmed-text)" };
  if (kind === "no") return { background: "var(--text-primary)", color: "var(--bg-page)", borderColor: "var(--text-primary)" };
  return { background: "var(--status-review-bg)", color: "var(--status-review-text)", borderColor: "var(--status-review-text)" };
}

function edgeColor(judgement: CheckItemContent["judgement"]): string {
  if (judgement === "yes") return "var(--status-confirmed-text)";
  if (judgement === "no") return "var(--text-faint)";
  return "var(--status-review-text)";
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

// nonfunctional_ux_phase1.md Step4：詳細（右ペイン）。確定ワークフロー・一括操作・
// 並べ替え・AI候補生成はフェーズ2/3の対象外のため、「⋯」メニューは採用解除の1項目のみ
// （Step5の指定通り「簡易な形」）。呼び出し元でkey={selectedAspect.id}を付けて観点切替時に
// このコンポーネントごと再マウントさせ、方針編集中フラグ・追加項目の入力途中値・
// 標準項目パネルの開閉状態が別の観点に持ち越されないようにする（規約58と同じ考え方）。
export function AspectDetailPane({
  projectId,
  tenantId,
  master,
  nodes,
  selectedAspect,
  onUnadopted,
}: {
  projectId: string;
  tenantId: string;
  master: AspectMaster[];
  nodes: NonfunctionalNode[];
  selectedAspect: NonfunctionalNode | null;
  onUnadopted: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [standardOpen, setStandardOpen] = useState(false);
  const [selectedStandard, setSelectedStandard] = useState<Set<string>>(new Set());
  const { show } = useToast();

  if (!selectedAspect) {
    return (
      <div className="flex items-center justify-center text-sm text-faint p-6" style={{ background: "var(--bg-page)" }}>
        左の観点カタログから、採用中の観点を選ぶか、未採用の観点を採用してください
      </div>
    );
  }

  const content = aspectContent(selectedAspect);
  const items = checkItemsOf(nodes, selectedAspect.id);
  const stats = aspectStats(nodes, selectedAspect.id);
  const pill = statusPill(selectedAspect, stats);
  const masterEntry = content.master_id ? master.find((m) => m.id === content.master_id) ?? null : null;
  const existingTexts = new Set(items.map((i) => checkItemContent(i).text));
  const availableStandardItems = (masterEntry?.default_items ?? []).filter((t) => !existingTexts.has(t));

  function savePolicy(policy: string) {
    startTransition(async () => {
      try {
        await updateAspectPolicy(selectedAspect!.id, projectId, policy);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function submitNewItem() {
    const text = newItemText.trim();
    if (!text) return;
    startTransition(async () => {
      try {
        await addCheckItem(selectedAspect!.id, projectId, tenantId, text);
        setNewItemText("");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleJudgement(itemId: string, judgement: CheckItemContent["judgement"]) {
    startTransition(async () => {
      try {
        await setCheckItemJudgement(itemId, projectId, judgement);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleDeleteItem(itemId: string) {
    startTransition(async () => {
      try {
        await deleteCheckItem(itemId, projectId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleUnadopt() {
    startTransition(async () => {
      try {
        await unadoptAspect(selectedAspect!.id, projectId);
        onUnadopted();
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function toggleStandardItem(text: string) {
    setSelectedStandard((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }

  function submitStandardItems() {
    const texts = [...selectedStandard];
    if (texts.length === 0) {
      setStandardOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await importMasterCheckItems(selectedAspect!.id, projectId, tenantId, texts);
        setSelectedStandard(new Set());
        setStandardOpen(false);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  return (
    <div className="flex flex-col" style={{ background: "var(--bg-page)" }} data-aspect-detail={selectedAspect.id}>
      <div className="px-6 py-4 border-b border-border flex items-center gap-2.5 flex-wrap" style={{ background: "var(--bg-sidebar)" }}>
        <span className="text-[11.5px] text-faint">非機能要件 ›</span>
        <span
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
          style={{ borderColor: "var(--text-primary)", color: "var(--text-primary)" }}
        >
          {content.name || "（未入力）"}
        </span>
        <span
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
          style={{ background: pill.bg, color: pill.fg, borderColor: pill.border }}
        >
          {pill.label}
        </span>
        <span className="ml-auto font-mono text-[11px] text-faint whitespace-nowrap" suppressHydrationWarning>
          更新 {formatRelativeTime(selectedAspect.updated_at)}
          {selectedAspect.updatedByName ? ` · ${selectedAspect.updatedByName}` : ""}
        </span>
        <Menu
          trigger={({ onClick }) => (
            <button
              type="button"
              onClick={onClick}
              disabled={isPending}
              className="font-mono text-xs px-2.5 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover"
            >
              ⋯
            </button>
          )}
        >
          <MenuItem onClick={handleUnadopt} danger>
            この観点を採用しない
          </MenuItem>
        </Menu>
      </div>

      <div className="px-6 pt-5 flex flex-col gap-4.5">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10.5px] font-semibold tracking-wider text-faint uppercase">この観点の方針</label>
          {editingPolicy ? (
            <Textarea
              autoFocus
              defaultValue={content.policy}
              rows={3}
              onBlur={(e) => {
                savePolicy(e.target.value);
                setEditingPolicy(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingPolicy(false);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
              }}
            />
          ) : (
            <div
              onClick={() => setEditingPolicy(true)}
              className="cursor-text rounded-[10px] border px-4 py-3.5 text-[15px] leading-[1.75]"
              style={{ borderColor: "var(--border)", background: "var(--bg-sidebar)" }}
            >
              {content.policy || <span className="text-faint">（この観点の方針を入力）</span>}
            </div>
          )}
          <span className="text-[11px] text-faint">クリックで編集できます（空のテキストボックスは常設しません）。</span>
        </div>

        <div className="flex flex-col gap-2.5 pb-6">
          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="font-mono text-[10.5px] font-semibold tracking-wider text-faint uppercase">チェック項目</label>
            <span className="font-mono text-[10.5px] text-faint">{items.length}</span>
            {availableStandardItems.length > 0 && !standardOpen && (
              <button
                type="button"
                onClick={() => setStandardOpen(true)}
                className="ml-auto text-[11.5px] font-medium px-3 py-2 rounded-md border border-border bg-page cursor-pointer hover:bg-hover whitespace-nowrap"
              >
                標準項目から選ぶ
              </button>
            )}
          </div>

          {standardOpen && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-border p-3">
              {availableStandardItems.map((text) => (
                <label key={text} className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <Checkbox checked={selectedStandard.has(text)} onChange={() => toggleStandardItem(text)} />
                  {text}
                </label>
              ))}
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={submitStandardItems}
                  className="text-[11.5px] font-medium px-3 py-1.5 rounded-md text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  追加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStandard(new Set());
                    setStandardOpen(false);
                  }}
                  className="text-[11.5px] font-medium px-3 py-1.5 rounded-md border border-border cursor-pointer hover:bg-hover"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {items.map((item) => {
            const ic = checkItemContent(item);
            return (
              <div
                key={item.id}
                data-checkitem-row={item.id}
                className="flex items-center gap-3 px-3.5 py-3 rounded-[10px] flex-wrap"
                style={{
                  borderTop: "1px solid var(--border)",
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: `3px solid ${edgeColor(ic.judgement)}`,
                  background: ic.judgement === "unknown" ? "var(--bg-page)" : "var(--bg-sidebar)",
                }}
              >
                <span
                  className="flex-1 min-w-0 text-[13.5px] leading-[1.7]"
                  style={{ textDecoration: ic.judgement === "no" ? "line-through" : "none" }}
                >
                  {ic.text}
                </span>
                <div className="flex flex-none" role="radiogroup">
                  {(["yes", "no", "unknown"] as const).map((kind, i) => {
                    const active = ic.judgement === kind;
                    const style = segmentStyle(active, kind);
                    return (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={isPending}
                        onClick={() => handleJudgement(item.id, kind)}
                        className="text-[11px] font-medium px-2.5 py-1.5 cursor-pointer whitespace-nowrap"
                        style={{
                          background: style.background,
                          color: style.color,
                          borderTop: `1px solid ${style.borderColor}`,
                          borderBottom: `1px solid ${style.borderColor}`,
                          borderRight: `1px solid ${style.borderColor}`,
                          borderLeft: i > 0 ? "none" : `1px solid ${style.borderColor}`,
                          borderTopLeftRadius: i === 0 ? 7 : 0,
                          borderBottomLeftRadius: i === 0 ? 7 : 0,
                          borderTopRightRadius: i === 2 ? 7 : 0,
                          borderBottomRightRadius: i === 2 ? 7 : 0,
                        }}
                      >
                        {JUDGEMENT_LABEL[kind]}
                      </button>
                    );
                  })}
                </div>
                <Menu
                  trigger={({ onClick }) => (
                    <button
                      type="button"
                      onClick={onClick}
                      disabled={isPending}
                      className="font-mono text-xs px-2 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover flex-none"
                    >
                      ⋯
                    </button>
                  )}
                >
                  <MenuItem onClick={() => handleDeleteItem(item.id)} danger>
                    削除
                  </MenuItem>
                </Menu>
              </div>
            );
          })}

          <Input
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewItem();
            }}
            placeholder="＋ チェック項目を追加（Enterで連続入力）"
            variant="bare"
            className="rounded-[10px] border border-dashed border-border text-faint hover:text-brand"
          />
        </div>
      </div>
    </div>
  );
}
