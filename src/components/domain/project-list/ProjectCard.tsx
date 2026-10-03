import Link from "next/link";
import type { ListedProjectRow } from "@/actions/projects";
import { ChapterSegments } from "@/components/domain/project-list/ChapterSegments";
import { buttonClasses } from "@/components/ui/button";
import { CHAPTER_NAMES, chapterHref } from "@/lib/chapters";
import { formatRelativeTime } from "@/lib/relative-time";

export function PlatformTag({ name }: { name: string }) {
  return <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-hover text-secondary whitespace-nowrap">{name}</span>;
}

// 「3分前・田中」形式の最終更新。相対時刻はレンダリング時点の時刻に依存するため、
// サーバー描画とhydrationで食い違わないようsuppressHydrationWarningを付ける（規約53）。
export function LastUpdated({ at, by }: { at: string | null; by: string | null }) {
  if (!at) return <span className="text-faint">更新履歴なし</span>;
  return (
    <span suppressHydrationWarning>
      {formatRelativeTime(at)}
      {by ? `・${by}` : ""}
    </span>
  );
}

export function ctaOf(p: ListedProjectRow): { label: string; href: string; variant: "primary" | "secondary" } {
  const s = p.summary;
  if (s.cta === "open" || s.continueChapterNo === null) return { label: "案件を開く →", href: `/projects/${p.id}`, variant: "secondary" };
  const chapter = CHAPTER_NAMES[s.continueChapterNo];
  return {
    label: `${chapter}から${s.cta === "continue" ? "続ける" : "始める"} →`,
    href: chapterHref(p.id, s.continueChapterNo),
    variant: s.cta === "continue" ? "primary" : "secondary",
  };
}

// カード全体のクリックは、案件名のリンクを要素全体に広げる（stretched link）方式。<a>の中に
// <a>/<button>を入れない。CTAは前面（z-10）の独立したリンク。
export function ProjectCard({ project: p }: { project: ListedProjectRow }) {
  const s = p.summary;
  const cta = ctaOf(p);
  return (
    <article
      data-project-card={p.id}
      className="relative flex h-full flex-col rounded-lg border border-border bg-page p-5 transition-colors hover:border-primary has-[a[data-stretch]:focus-visible]:ring-2 has-[a[data-stretch]:focus-visible]:ring-brand has-[a[data-stretch]:focus-visible]:ring-offset-1"
    >
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-faint">
        <span className="truncate">{p.customerName}</span>
        {p.platform && <PlatformTag name={p.platform} />}
      </div>
      <h2 className="mb-3 text-[15px] font-medium text-primary">
        <Link
          href={`/projects/${p.id}`}
          data-stretch
          className="block truncate outline-none after:absolute after:inset-0 after:content-['']"
        >
          {p.name}
        </Link>
      </h2>

      <ChapterSegments summary={s} />
      <div className="mb-4 mt-2 flex items-baseline gap-3 text-xs tabular-nums text-secondary">
        <span className={`text-sm font-semibold ${s.rate === 0 ? "text-faint" : "text-primary"}`}>{s.rate}%</span>
        <span>
          確定 {s.confirmed} / {s.total} 項目
        </span>
        <span className="ml-auto">
          {s.confirmedChapters}/{s.chapters.length}章
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hover pt-3">
        <span className="min-w-0 truncate text-[11px] text-faint">
          <LastUpdated at={s.lastUpdatedAt} by={p.lastUpdatedByName} />
        </span>
        <Link
          href={cta.href}
          data-project-cta={p.id}
          className={`${buttonClasses(cta.variant, "sm")} relative z-10 shrink-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 outline-none`}
        >
          {cta.label}
        </Link>
      </div>
    </article>
  );
}
