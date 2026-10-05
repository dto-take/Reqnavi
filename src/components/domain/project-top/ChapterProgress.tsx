"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { chapterHref } from "@/lib/chapters";
import {
  buildPhases,
  filterCounts,
  segmentsFor,
  type ChapterCardData,
  type ChapterFilter,
  type SegmentColor,
} from "@/lib/project-top/derive";
import { formatRelativeTime } from "@/lib/relative-time";
import { usePersistedValue } from "@/lib/use-persisted-value";

// 色は既存のデザイントークンに対応づける：確定＝緑(--brand)、作成中＝琥珀(--status-review-*)、
// 曖昧表現＝赤茶(--status-needhearing-*)、未着手＝淡い灰(--border)。
const SEG_COLOR: Record<SegmentColor, string> = {
  confirmed: "var(--brand)",
  in_progress: "var(--status-review-text)",
  not_started: "var(--border)",
};
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1";

// 表示形式は全案件共通、フェーズの開閉は案件ごとに保存する（共通フック usePersistedValue。規約54）
const VIEW_KEY = "reqnavi:project-top-view";
const collapsedKey = (projectId: string) => `reqnavi:project-top-collapsed:${projectId}`;

const FILTERS: { key: ChapterFilter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "unconfirmed", label: "未確定あり" },
  { key: "ambiguous", label: "曖昧表現あり" },
];

function StatusLabel({ card }: { card: ChapterCardData }) {
  if (card.hidden) return <span data-hidden-chapter className="text-[10.5px] font-medium text-faint">非公開</span>;
  if (card.status === "confirmed") return <span className="text-[10.5px] font-medium text-brand">✓ 確定済</span>;
  if (card.status === "in_progress") return <span className="text-[10.5px] font-medium" style={{ color: "var(--status-review-text)" }}>作成中</span>;
  return <span className="text-[10.5px] font-medium text-secondary">未着手</span>;
}

function AmbiguousBadge({ count }: { count: number | null }) {
  if (!count) return null;
  return (
    <span
      data-ambiguous-badge
      className="rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums"
      style={{ color: "var(--status-needhearing-text)", background: "var(--status-needhearing-bg)", borderColor: "var(--status-needhearing-text)" }}
    >
      ⚠ 曖昧 {count}
    </span>
  );
}

function Segments({ card }: { card: ChapterCardData }) {
  if (card.hidden) return <div className="h-[5px] rounded-sm border border-dashed border-border" aria-hidden="true" />;
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {segmentsFor(card).map((c, i) => (
        <span key={i} data-seg={c} className="h-[5px] flex-1 rounded-sm" style={{ backgroundColor: SEG_COLOR[c] }} />
      ))}
    </div>
  );
}

// 確定数の表示。15章（進捗）は確定の概念が無いため「工程 N 件」
function CountText({ card }: { card: ChapterCardData }) {
  if (card.hidden) return <>―</>;
  if (card.isProgress) return <>工程 {card.total} 件</>;
  return (
    <>
      {card.confirmed}/{card.total}
    </>
  );
}

// カード全体・行全体のクリックは、章名のリンクを要素全体に広げる（stretched link）方式。入れ子の<a>は作らない。
function ChapterCard({ card, projectId, next }: { card: ChapterCardData; projectId: string; next: boolean }) {
  return (
    <article
      data-chapter-card={card.chapterNo}
      data-next-chapter={next ? "1" : undefined}
      className={`relative flex flex-col gap-2 rounded-xl p-3.5 transition-colors hover:bg-page has-[a[data-stretch]:focus-visible]:ring-2 has-[a[data-stretch]:focus-visible]:ring-brand has-[a[data-stretch]:focus-visible]:ring-offset-1 ${
        card.status === "confirmed" ? "bg-hover" : "bg-sidebar"
      } ${next ? "border-2 border-brand" : "border border-border"}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-faint">{String(card.chapterNo).padStart(2, "0")}</span>
        <StatusLabel card={card} />
      </div>
      <h3 className="text-[14px] font-semibold leading-snug text-primary">
        {card.hidden ? (
          <span className="text-faint">{card.chapterNo}. {card.name}</span>
        ) : (
          <Link href={chapterHref(projectId, card.chapterNo)} data-stretch className="outline-none after:absolute after:inset-0 after:content-['']">
            {card.chapterNo}. {card.name}
          </Link>
        )}
      </h3>
      <Segments card={card} />
      <div className="flex items-center gap-2 text-[11px] tabular-nums text-secondary">
        <span className="font-mono">
          <CountText card={card} />
        </span>
        <AmbiguousBadge count={card.ambiguousCount} />
        <span className="ml-auto truncate text-[10.5px] text-faint">{card.updatedBy ?? ""}</span>
      </div>
    </article>
  );
}

const ROW_GRID = "grid items-center gap-x-3 grid-cols-[minmax(0,1.6fr)_5.5rem_4.5rem] min-[800px]:grid-cols-[minmax(0,1.6fr)_5.5rem_4.5rem_5rem_7rem]";

function ChapterRow({ card, projectId, next }: { card: ChapterCardData; projectId: string; next: boolean }) {
  return (
    <div
      data-chapter-row={card.chapterNo}
      data-next-chapter={next ? "1" : undefined}
      className={`${ROW_GRID} relative border-t border-hover px-4 py-2.5 text-sm first:border-t-0 hover:bg-page has-[a[data-stretch]:focus-visible]:ring-2 has-[a[data-stretch]:focus-visible]:ring-inset has-[a[data-stretch]:focus-visible]:ring-brand ${
        next ? "border-l-[3px] border-l-brand bg-page" : ""
      }`}
    >
      {card.hidden ? (
        <span className="truncate font-medium text-faint">{card.chapterNo}. {card.name}</span>
      ) : (
        <Link href={chapterHref(projectId, card.chapterNo)} data-stretch className="truncate font-medium text-primary outline-none after:absolute after:inset-0 after:content-['']">
          {card.chapterNo}. {card.name}
        </Link>
      )}
      <StatusLabel card={card} />
      <span className="font-mono text-[11px] tabular-nums text-secondary">
        <CountText card={card} />
      </span>
      <span className="hidden min-[800px]:block">
        <AmbiguousBadge count={card.ambiguousCount} />
      </span>
      <span className="hidden truncate text-[11px] text-faint min-[800px]:block">
        {card.updatedAt ? (
          <span suppressHydrationWarning>
            {formatRelativeTime(card.updatedAt)}
            {card.updatedBy ? `・${card.updatedBy}` : ""}
          </span>
        ) : (
          "―"
        )}
      </span>
    </div>
  );
}

export function ChapterProgress({
  projectId,
  cards,
  nextChapterNo,
}: {
  projectId: string;
  cards: ChapterCardData[];
  nextChapterNo: number | null;
}) {
  const [viewRaw, setView] = usePersistedValue(VIEW_KEY, "card");
  const view = viewRaw === "table" ? "table" : "card";
  const [collapsedRaw, setCollapsedRaw] = usePersistedValue(collapsedKey(projectId), "[]");
  const collapsed = useMemo(() => {
    try {
      const v = JSON.parse(collapsedRaw);
      return new Set<string>(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [collapsedRaw]);
  const [filter, setFilter] = useState<ChapterFilter>("all");

  // 件数は、フィルタとは独立した全章に対する件数
  const counts = useMemo(() => filterCounts(cards), [cards]);
  const phases = useMemo(() => buildPhases(cards, filter), [cards, filter]);

  function toggle(label: string) {
    const next = new Set(collapsed);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setCollapsedRaw(JSON.stringify([...next]));
  }

  return (
    <section aria-labelledby="chapter-progress-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="chapter-progress-title" className="text-[17px] font-semibold text-primary">
          章の進み具合
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              data-filter-chip={f.key}
              onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11.5px] font-medium tabular-nums ${FOCUS} ${
                filter === f.key ? "border-primary bg-primary text-page" : "border-border bg-page text-secondary hover:bg-hover"
              }`}
            >
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="表示形式" className="ml-auto flex gap-1 rounded-md border border-border p-0.5">
          {(["card", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`cursor-pointer rounded px-3 py-1 text-xs ${FOCUS} ${view === v ? "bg-primary font-medium text-page" : "text-secondary hover:text-primary"}`}
            >
              {v === "card" ? "▦ カード" : "☰ 一覧"}
            </button>
          ))}
        </div>
      </div>

      {phases.length === 0 ? (
        <p className="rounded-lg border border-border bg-page px-4 py-6 text-center text-sm text-secondary" data-empty-phases>
          条件に合う章がありません。
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {phases.map((p) => {
            const open = !collapsed.has(p.label);
            return (
              <div key={p.label} data-phase={p.label}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(p.label)}
                  className={`mb-2 flex w-full cursor-pointer items-center gap-3 rounded-md px-1 py-1 text-left ${FOCUS}`}
                >
                  <span aria-hidden="true" className="text-xs text-faint">{open ? "▾" : "▸"}</span>
                  <span className="text-[13.5px] font-bold text-primary">{p.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-faint" data-phase-count>
                    {p.progressOnly ? "確定の対象外" : `${p.confirmedChapters}/${p.confirmableChapters}章 確定`}
                  </span>
                  {!p.progressOnly && (
                    <span className="h-1 w-20 overflow-hidden rounded-full bg-border" aria-hidden="true">
                      <span className="block h-full bg-brand" style={{ width: `${Math.round(p.progressFraction * 100)}%` }} />
                    </span>
                  )}
                </button>
                {open &&
                  (view === "card" ? (
                    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
                      {p.cards.map((c) => (
                        <ChapterCard key={c.chapterNo} card={c} projectId={projectId} next={c.chapterNo === nextChapterNo} />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border bg-sidebar" role="table" aria-label={`${p.label}の章`}>
                      <div className={`${ROW_GRID} border-b border-border px-4 py-2 text-[11px] text-faint`} role="row">
                        <span>章名</span>
                        <span>状態</span>
                        <span>確定数</span>
                        <span className="hidden min-[800px]:block">曖昧</span>
                        <span className="hidden min-[800px]:block">最終更新</span>
                      </div>
                      <div role="rowgroup">
                        {p.cards.map((c) => (
                          <ChapterRow key={c.chapterNo} card={c} projectId={projectId} next={c.chapterNo === nextChapterNo} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
