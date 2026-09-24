"use client";

import { useState } from "react";
import { adoptedAspects, aspectContent, aspectStats, overallProgress, poolItems, type PoolItem } from "@/lib/nonfunctional/derive";
import type { AspectMaster, NonfunctionalNode } from "@/actions/nonfunctional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// nonfunctional_ux_phase1.md Step4：観点カタログ（左ペイン）。「採用中」「未採用」の
// 2セクションに分け、観点追加の入口をこのペインへ一元化する（右の詳細ペインには
// 観点追加の手段を置かない）。並べ替え（⠿ドラッグ）・一括操作はフェーズ2の対象外。
export function AspectCatalogPane({
  master,
  nodes,
  selectedId,
  onSelect,
  onAdoptMaster,
  onReactivate,
  onCreateCustom,
  isPending,
}: {
  master: AspectMaster[];
  nodes: NonfunctionalNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdoptMaster: (masterId: string, name: string) => void;
  onReactivate: (aspectId: string) => void;
  onCreateCustom: (name: string) => void;
  isPending: boolean;
}) {
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customName, setCustomName] = useState("");

  const adopted = adoptedAspects(nodes);
  const pool = poolItems(nodes, master);
  const progress = overallProgress(nodes);
  const progressPct = progress.total > 0 ? Math.round((progress.judged / progress.total) * 100) : 0;

  function submitCustom() {
    const trimmed = customName.trim();
    if (!trimmed) {
      setCreatingCustom(false);
      return;
    }
    onCreateCustom(trimmed);
    setCustomName("");
    setCreatingCustom(false);
  }

  return (
    <div className="flex flex-col border-r border-border" style={{ background: "var(--bg-sidebar)" }}>
      <div className="px-4 py-3.5 border-b border-border flex flex-col gap-2.5">
        <span className="font-mono text-[10.5px] tracking-wide text-faint">CHAPTER 10 / 15</span>
        <h1 className="text-lg font-semibold text-primary">非機能要件</h1>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: "var(--brand)" }} />
          </div>
          <span className="font-mono text-[11px] text-faint flex-none">
            {progress.judged}/{progress.total}
          </span>
        </div>
        <span className="text-[11px] text-faint">判定済のチェック項目 / 採用観点の全項目</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 560 }}>
        <div className="px-3.5 pt-3 pb-1.5 flex items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-wide text-faint uppercase">採用中</span>
          <span className="font-mono text-[10.5px] text-faint">{adopted.length}</span>
        </div>
        <div className="flex flex-col px-1.5">
          {adopted.map((a) => {
            const selected = a.id === selectedId;
            const stats = aspectStats(nodes, a.id);
            const dot =
              a.status === "confirmed" || a.status === "exception_approved"
                ? "var(--status-confirmed-text)"
                : stats.unknown > 0
                  ? "var(--status-review-text)"
                  : "var(--text-faint)";
            return (
              <div
                key={a.id}
                data-aspect-row={a.id}
                onClick={() => onSelect(a.id)}
                role="treeitem"
                aria-selected={selected}
                tabIndex={0}
                className="flex items-center gap-2 px-2.5 py-2.5 rounded-md cursor-pointer text-[12.5px] hover:bg-hover focus:outline-2 focus:-outline-offset-2"
                style={{
                  background: selected ? "var(--bg-page)" : "transparent",
                  borderLeft: `3px solid ${selected ? "var(--text-primary)" : "transparent"}`,
                }}
              >
                <span className="w-1.75 h-1.75 rounded-full flex-none" style={{ background: dot }} />
                <span className={`flex-1 min-w-0 truncate ${selected ? "font-bold" : ""}`}>{aspectContent(a).name || "（未入力）"}</span>
                <span className="font-mono text-[10px] text-faint flex-none">
                  {stats.judged}/{stats.total}
                </span>
              </div>
            );
          })}
        </div>

        <div className="px-3.5 pt-4 pb-1.5 flex items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-wide text-faint uppercase">未採用</span>
          <span className="font-mono text-[10.5px] text-faint">{pool.length}</span>
        </div>
        <div className="flex flex-col gap-1 px-1.5 pb-2">
          {pool.map((p) => (
            <PoolRow key={poolKey(p)} item={p} isPending={isPending} onAdoptMaster={onAdoptMaster} onReactivate={onReactivate} />
          ))}

          {creatingCustom ? (
            <div className="flex items-center gap-1.5 px-1 py-0.5">
              <Input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCustom();
                  if (e.key === "Escape") {
                    setCustomName("");
                    setCreatingCustom(false);
                  }
                }}
                onBlur={submitCustom}
                placeholder="観点名"
                className="flex-1 h-8 text-xs"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingCustom(true)}
              className="text-left mt-1 mx-1 px-3.5 py-2.5 rounded-lg border border-dashed border-border text-xs text-faint cursor-pointer hover:bg-page hover:text-brand"
            >
              ＋ 独自の観点を作る
            </button>
          )}
        </div>
      </div>

      <div className="mt-auto px-3.5 py-3 border-t border-border">
        <p className="text-[11px] leading-relaxed text-faint">
          採用した観点だけが提案書に出力されます。未採用のまま残すことで「検討済み」の証跡になります。
        </p>
      </div>
    </div>
  );
}

function poolKey(item: PoolItem): string {
  return item.kind === "master" ? `master-${item.masterId}` : `rejected-${item.aspectId}`;
}

function PoolRow({
  item,
  isPending,
  onAdoptMaster,
  onReactivate,
}: {
  item: PoolItem;
  isPending: boolean;
  onAdoptMaster: (masterId: string, name: string) => void;
  onReactivate: (aspectId: string) => void;
}) {
  return (
    <div data-pool-item={poolKey(item)} className="flex items-center gap-2 px-2.5 py-2 rounded-md">
      <span className="flex-1 min-w-0 truncate text-[12.5px] text-faint">{item.name || "（未入力）"}</span>
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => (item.kind === "master" ? onAdoptMaster(item.masterId, item.name) : onReactivate(item.aspectId))}
      >
        採用
      </Button>
    </div>
  );
}
