"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { chapterHref } from "@/lib/chapters";
import type { ChapterStatus } from "@/lib/chapter-status";
import type { OverallRate } from "@/lib/chapter-stats";

export type SidebarChapter = {
  no: number;
  name: string;
  status: ChapterStatus | null; // nullは進捗を表示しない（メンバーではない案件）
  ambiguous: number | null; // 4・10・15章は対象外（null）
  hidden?: boolean; // このロールに非公開の章
};

// 状態ドット：9pxで、確定・作成中・未着手（白抜き）の3段階を区別しやすくする
function Dot({ status }: { status: ChapterStatus }) {
  const style =
    status === "confirmed"
      ? { backgroundColor: "var(--status-confirmed-text)", border: "1.5px solid var(--status-confirmed-text)" }
      : status === "in_progress"
        ? { backgroundColor: "var(--status-review-text)", border: "1.5px solid var(--status-review-text)" }
        : { backgroundColor: "var(--bg-page)", border: "1.5px solid var(--text-faint)" };
  return <span data-chapter-dot={status} style={style} className="inline-block h-[9px] w-[9px] shrink-0 rounded-full" />;
}

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1";
const LINK_BASE = `flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-hover ${FOCUS}`;
const ACTIVE = "bg-page font-bold text-primary border-l-[3px] border-l-primary";
const INACTIVE = "text-secondary hover:text-primary border-l-[3px] border-l-transparent";

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${LINK_BASE} ${active ? ACTIVE : INACTIVE}`}>
      {children}
    </Link>
  );
}

// 案件配下の全画面で共通のサイドバー。現在地（案件トップ／開いている章／その他の画面）を強調する。
export function ProjectSidebar({
  projectId,
  projectName,
  overall,
  chapters,
}: {
  projectId: string;
  projectName: string;
  overall: OverallRate | null; // 案件全体の確定率
  chapters: SidebarChapter[];
}) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const isTop = pathname === base;
  const isUnder = (sub: string) => pathname === `${base}/${sub}` || pathname.startsWith(`${base}/${sub}/`);

  return (
    <nav className="w-56 bg-sidebar border-r border-border p-4 shrink-0" aria-label="案件メニュー">
      <Link href="/projects" className={`text-xs text-secondary underline mb-4 block ${FOCUS}`}>
        ← 案件一覧
      </Link>
      <div className="text-sm font-semibold text-primary mb-2 truncate" title={projectName}>
        {projectName}
      </div>

      {overall !== null && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-faint mb-1">
            <span>確定率</span>
            <span className="tabular-nums" data-sidebar-rate>{overall.rate}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div style={{ width: `${overall.rate}%` }} className="h-full bg-brand" />
          </div>
          <div className="mt-1 text-[10px] tabular-nums text-faint" data-sidebar-count>
            確定 {overall.confirmed} / {overall.total} 項目
          </div>
        </div>
      )}

      {overall !== null && (
        <div className="flex items-center gap-2 text-[9px] text-faint mb-3">
          <span className="flex items-center gap-1">
            <Dot status="not_started" />
            未着手
          </span>
          <span className="flex items-center gap-1">
            <Dot status="in_progress" />
            進行中
          </span>
          <span className="flex items-center gap-1">
            <Dot status="confirmed" />
            確定
          </span>
        </div>
      )}

      <div className="flex flex-col gap-0.5 mb-3">
        <NavLink href={base} active={isTop}>
          案件トップ
        </NavLink>
      </div>

      <details open>
        <summary className="text-[11px] text-faint mb-1 cursor-pointer select-none">要件定義</summary>
        <div className="flex flex-col gap-0.5 mb-4">
          {chapters.map((c) =>
            c.hidden ? (
              <span key={c.no} data-sidebar-hidden={c.no} className="flex items-center gap-2 rounded border-l-[3px] border-l-transparent px-2 py-1 text-sm text-faint">
                <span className="min-w-0 flex-1 truncate">{c.no}. {c.name}</span>
                <span className="text-[9.5px]">非公開</span>
              </span>
            ) : (
            <NavLink key={c.no} href={chapterHref(projectId, c.no)} active={pathname === chapterHref(projectId, c.no) || pathname.startsWith(`${chapterHref(projectId, c.no)}/`)}>
              {c.status && <Dot status={c.status} />}
              <span className="min-w-0 flex-1 truncate">
                {c.no}. {c.name}
              </span>
              {c.ambiguous ? (
                <span
                  data-sidebar-ambiguous={c.no}
                  className="rounded-full px-1.5 font-mono text-[9.5px] font-medium tabular-nums"
                  style={{ color: "var(--status-needhearing-text)", background: "var(--status-needhearing-bg)" }}
                >
                  ⚠{c.ambiguous}
                </span>
              ) : null}
            </NavLink>
            )
          )}
        </div>
      </details>

      <details open>
        <summary className="text-[11px] text-faint mb-1 cursor-pointer select-none">確定判定</summary>
        <div className="flex flex-col gap-0.5 mb-4">
          <NavLink href={`${base}/readiness`} active={isUnder("readiness")}>確定判定ダッシュボード</NavLink>
          <NavLink href={`${base}/consistency`} active={isUnder("consistency")}>整合性チェック（全体）</NavLink>
          <NavLink href={`${base}/baseline`} active={isUnder("baseline")}>ベースライン</NavLink>
          <NavLink href={`${base}/changes`} active={isUnder("changes")}>差分管理</NavLink>
        </div>
      </details>

      <details open>
        <summary className="text-[11px] text-faint mb-1 cursor-pointer select-none">案件管理</summary>
        <div className="flex flex-col gap-0.5">
          <NavLink href={`${base}/documents`} active={isUnder("documents")}>資料</NavLink>
          <NavLink href={`${base}/business-flow`} active={isUnder("business-flow")}>業務フロー</NavLink>
          <NavLink href={`${base}/effort`} active={isUnder("effort")}>工数記録</NavLink>
          <NavLink href={`${base}/members`} active={isUnder("members")}>メンバー</NavLink>
          <NavLink href={`${base}/settings`} active={isUnder("settings")}>案件設定</NavLink>
        </div>
      </details>
    </nav>
  );
}
