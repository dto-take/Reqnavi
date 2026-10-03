import Link from "next/link";
import type { ListedProjectRow } from "@/actions/projects";
import { ChapterSegments } from "@/components/domain/project-list/ChapterSegments";
import { LastUpdated, PlatformTag } from "@/components/domain/project-list/ProjectCard";

// 一覧（表）表示の列。「⋯」メニューの列は作らない（複製・アーカイブは別設計）。
// 900px未満では「確定項目」「最終更新」の列を隠す。
export const ROW_GRID =
  "grid items-center gap-x-4 grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.8fr)] min-[900px]:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.8fr)_6.5rem_8rem]";

export function ProjectTableHeader() {
  return (
    <div className={`${ROW_GRID} border-b border-border px-4 py-2 text-[11px] text-faint`} role="row">
      <span>案件</span>
      <span>顧客</span>
      <span>章の進捗</span>
      <span className="hidden min-[900px]:block">確定項目</span>
      <span className="hidden min-[900px]:block">最終更新</span>
    </div>
  );
}

// 行全体のクリックは、案件名のリンクを行全体に広げる（stretched link）方式。入れ子の<a>は作らない。
export function ProjectRow({ project: p }: { project: ListedProjectRow }) {
  const s = p.summary;
  return (
    <div
      data-project-row={p.id}
      className={`${ROW_GRID} relative border-t border-hover px-4 py-3 text-sm first:border-t-0 hover:bg-hover has-[a[data-stretch]:focus-visible]:ring-2 has-[a[data-stretch]:focus-visible]:ring-inset has-[a[data-stretch]:focus-visible]:ring-brand`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href={`/projects/${p.id}`}
          data-stretch
          className="truncate font-medium text-primary outline-none after:absolute after:inset-0 after:content-['']"
        >
          {p.name}
        </Link>
        {p.platform && <PlatformTag name={p.platform} />}
      </div>
      <span className="truncate text-secondary">{p.customerName}</span>
      <div className="flex items-center gap-2">
        <ChapterSegments summary={s} className="flex-1" />
        <span className="text-[11px] tabular-nums text-faint whitespace-nowrap">
          {s.confirmedChapters}/{s.confirmableChapters}章
        </span>
      </div>
      <span className="hidden text-xs tabular-nums text-secondary min-[900px]:block">
        {s.confirmed}/{s.total}{" "}
        <span className={s.rate === 0 ? "text-faint" : "text-primary"}>{s.rate}%</span>
      </span>
      <span className="hidden truncate text-[11px] text-faint min-[900px]:block">
        <LastUpdated at={s.lastUpdatedAt} by={p.lastUpdatedByName} />
      </span>
    </div>
  );
}
