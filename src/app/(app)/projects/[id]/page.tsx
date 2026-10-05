import Link from "next/link";
import { getProjectTopData, getUserDisplayNames } from "@/actions/project-top";
import { getIsProjectMember, getProjectHeader, getProjectProgressData } from "@/lib/project-data";
import { CHAPTER_NAMES, chapterHref } from "@/lib/chapters";
import { buildChapterCards, decideNextChapter, type ChapterCardData } from "@/lib/project-top/derive";
import { formatRelativeTime } from "@/lib/relative-time";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { ExportMenu } from "@/components/domain/project-top/ExportMenu";
import { ChapterProgress } from "@/components/domain/project-top/ChapterProgress";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1";

function NextAction({
  projectId,
  cards,
  hasBaseline,
}: {
  projectId: string;
  cards: ChapterCardData[];
  hasBaseline: boolean;
}) {
  const next = decideNextChapter(cards, hasBaseline);
  let title: string;
  let sub: React.ReactNode = null;
  let href: string;
  let label: string;
  if (next.kind === "all_confirmed") {
    title = next.baseline ? "すべての章が確定済みです" : "すべての章が確定しました。ベースラインを確定する";
    href = next.baseline ? `/projects/${projectId}/readiness` : `/projects/${projectId}/baseline`;
    label = next.baseline ? "確定判定ダッシュボードへ →" : "ベースラインへ →";
  } else {
    const card = cards.find((c) => c.chapterNo === next.chapterNo)!;
    href = chapterHref(projectId, card.chapterNo);
    if (next.kind === "start") {
      title = `${card.chapterNo}. ${card.name} を始める`;
      sub = "AI素案を生成してから、確認・確定する流れがおすすめです";
      label = "始める →";
    } else {
      title = `${card.chapterNo}. ${card.name} の未確定 ${card.total - card.confirmed} ${card.unitLabel}を確定する`;
      label = "続きを開く →";
      const parts: React.ReactNode[] = [];
      if ((card.ambiguousCount ?? 0) > 0) parts.push(`曖昧表現 ${card.ambiguousCount} 件あり`);
      if (card.updatedAt) {
        parts.push(
          <span key="t" suppressHydrationWarning>
            {formatRelativeTime(card.updatedAt)} {card.updatedBy ? `${card.updatedBy}に` : ""}編集
          </span>
        );
      }
      sub = parts.flatMap((p, i) => (i === 0 ? [p] : [" ・ ", p]));
    }
  }
  return (
    <section
      aria-label="次にやること"
      data-next-action
      className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[#cfd9d2] bg-page py-5 pl-[22px] pr-[22px] shadow-sm"
      style={{ borderLeft: "5px solid var(--brand)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 font-mono text-[10.5px] font-medium tracking-[.12em] text-faint">NEXT</div>
        <p data-next-title className="text-[18px] font-semibold leading-relaxed text-primary">{title}</p>
        {sub && <p data-next-sub className="mt-1 text-xs text-secondary">{sub}</p>}
      </div>
      <Link href={href} data-next-button className={`${buttonClasses("primary", "md")} whitespace-nowrap ${FOCUS}`}>
        {label}
      </Link>
    </section>
  );
}

const KIND_LABEL = { confirmed: "確定", edit: "編集", ai: "AI" } as const;

export default async function ProjectHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [header, isMember] = await Promise.all([getProjectHeader(id), getIsProjectMember(id)]);

  const title = (
    <div className="mb-6">
      <p className="text-xs text-secondary">
        {header?.customerName ?? "―"}
        {header?.platform ? ` ・ ${header.platform}` : ""}
      </p>
      <h1 className="text-[26px] font-semibold leading-tight text-primary">{header?.name}</h1>
    </div>
  );

  // メンバーではない案件（管理者のみ開ける）は集計が取れないため、進捗は出さない
  if (!isMember) {
    return (
      <div className="mx-auto mt-10 max-w-6xl px-6">
        {title}
        <Card data-not-member>
          <p className="text-sm text-secondary">メンバーではない案件のため、進捗は表示されません。</p>
        </Card>
      </div>
    );
  }

  const progress = await getProjectProgressData(id);
  const selected = header?.selectedChapters ?? [];
  const nameIds = progress.stats.map((s) => s.updatedBy).filter((x): x is string => !!x);
  const [top, names] = await Promise.all([getProjectTopData(id), getUserDisplayNames(nameIds)]);

  const cards = buildChapterCards(selected, progress.stats, progress.ambiguous, names, progress.hiddenChapters);
  const next = decideNextChapter(cards, top.hasBaseline);
  const overall = progress.overall;

  return (
    <div className="mx-auto mt-10 max-w-6xl px-6 pb-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-secondary">
            {header?.customerName ?? "―"}
            {header?.platform ? ` ・ ${header.platform}` : ""}
          </p>
          <h1 className="text-[26px] font-semibold leading-tight text-primary">{header?.name}</h1>
          <p className="mt-1.5 flex items-baseline gap-2 text-xs text-secondary" data-project-summary>
            <span className="font-mono text-[15px] font-medium tabular-nums text-brand">{overall.rate}%</span>
            <span className="tabular-nums">
              確定率 ・ 確定 {overall.confirmed} / {overall.total} 項目 ・ メンバー {top.memberCount}名
            </span>
          </p>
          {progress.hiddenChapters.length > 0 && (
            <p data-hidden-note className="mt-0.5 text-[11px] text-faint">一部の章は非公開のため、集計に含まれません</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${id}/bulk-generate`} className={`${buttonClasses("secondary", "md")} ${FOCUS}`}>
            AI素案を一括生成
          </Link>
          <ExportMenu projectId={id} />
        </div>
      </div>

      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_270px] min-[1100px]:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <NextAction projectId={id} cards={cards} hasBaseline={top.hasBaseline} />
          <ChapterProgress projectId={id} cards={cards} nextChapterNo={next.kind === "all_confirmed" ? null : next.chapterNo} />
        </div>

        <aside className="flex flex-col gap-4" aria-label="最近の動きと資料">
          <section className="rounded-[14px] border border-border bg-sidebar px-[18px] pb-2 pt-[18px]" data-recent-activity>
            <h2 className="mb-2 text-[14.5px] font-semibold text-primary">最近の動き</h2>
            {top.activity.length === 0 ? (
              <p className="pb-3 text-xs text-secondary">まだ動きはありません</p>
            ) : (
              <ul>
                {top.activity.map((a) => (
                  <li key={a.id} className="border-t border-hover first:border-t-0">
                    <Link
                      href={chapterHref(id, a.chapterNo)}
                      data-activity-item
                      className={`-mx-1 block rounded px-1 py-2.5 hover:bg-hover ${FOCUS}`}
                    >
                      <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                        <span
                          data-activity-kind={a.kind}
                          className={`rounded px-1.5 py-px text-[9.5px] font-medium ${
                            a.kind === "confirmed" ? "bg-brand text-white" : a.kind === "ai" ? "border border-dashed border-faint text-secondary" : "border border-border text-secondary"
                          }`}
                        >
                          {KIND_LABEL[a.kind]}
                        </span>
                        <span className="truncate">
                          {CHAPTER_NAMES[a.chapterNo]} ・{" "}
                          <span suppressHydrationWarning>{formatRelativeTime(a.at)}</span>
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[12.5px] font-medium leading-relaxed text-primary">{a.summary}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[14px] border border-border bg-sidebar px-[18px] pb-3 pt-[18px]" data-recent-docs>
            <h2 className="mb-2 flex items-baseline gap-2 text-[14.5px] font-semibold text-primary">
              最近の資料
              <span className="text-[11px] font-normal text-faint" data-doc-count>全{top.documentCount}件</span>
            </h2>
            {top.recentDocuments.length === 0 ? (
              <p className="pb-2 text-xs text-secondary">まだ資料がアップロードされていません</p>
            ) : (
              <ul>
                {top.recentDocuments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 border-t border-hover py-2 first:border-t-0">
                    <span className="truncate text-[12.5px] text-primary" title={d.fileName}>{d.fileName}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-faint" suppressHydrationWarning>
                      {new Date(d.updatedAt).toLocaleDateString("ja-JP")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/projects/${id}/documents`} className={`mt-1 inline-block rounded text-xs text-secondary underline hover:text-primary ${FOCUS}`}>
              資料をすべて見る →
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
