import Link from "next/link";
import { createServerActionClient } from "@/lib/supabase/server";
import { CHAPTER_NAMES } from "@/lib/chapters";
import { getReadinessSummary, getSimpleChapterStatuses } from "@/actions/readiness";
import { chapterStatusFromReadiness, statusColor, type ChapterStatus } from "@/lib/chapter-status";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerActionClient();
  const { data: project } = await supabase
    .from("projects")
    .select("name, selected_chapters")
    .eq("id", id)
    .single();

  const selectedChapters = ((project?.selected_chapters as number[]) ?? []).sort((a, b) => a - b);

  const [readiness, simpleStatuses] = await Promise.all([
    getReadinessSummary(id),
    getSimpleChapterStatuses(id),
  ]);
  const readinessMap = new Map<number, ChapterStatus>(
    readiness.map((r) => [r.chapterNo, chapterStatusFromReadiness(r)])
  );
  const avgReadiness = readiness.length > 0
    ? Math.round(readiness.reduce((sum, r) => sum + r.readinessRate, 0) / readiness.length)
    : 0;

  function chapterDot(chapterNo: number) {
    const status: ChapterStatus = readinessMap.get(chapterNo) ?? simpleStatuses[chapterNo] ?? "not_started";
    // statusColor()のbgはバッジ用の淡い背景色で、--bg-sidebar（サイドバー自体の背景）と
    // 明度がほぼ同じため、6px程度の小さいドットに使うと視認できない
    // （実機確認：not_startedの淡いベージュがサイドバーの淡いベージュに沈む）。
    // ドットには濃い方のtext色を使う。
    const { text } = statusColor(status);
    return <span style={{ backgroundColor: text }} className="w-1.5 h-1.5 rounded-full inline-block shrink-0" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <nav className="w-56 bg-sidebar border-r border-border p-4 shrink-0">
        <Link href="/projects" className="text-xs text-secondary underline mb-4 block">
          ← 案件一覧
        </Link>
        <Link href={`/projects/${id}`} className="text-sm font-semibold text-primary mb-1 truncate block hover:underline">
          {project?.name}
        </Link>
        <Link href={`/projects/${id}`} className="text-xs text-secondary hover:text-primary mb-3 block">
          ← 案件トップに戻る
        </Link>

        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-faint mb-1">
            <span>全体進捗</span><span>{avgReadiness}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div style={{ width: `${avgReadiness}%` }} className="h-full bg-brand" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-[9px] text-faint mb-3">
          <span className="flex items-center gap-1">
            <span style={{ backgroundColor: "var(--status-draft-text)" }} className="w-1.5 h-1.5 rounded-full inline-block" />
            未着手
          </span>
          <span className="flex items-center gap-1">
            <span style={{ backgroundColor: "var(--status-review-text)" }} className="w-1.5 h-1.5 rounded-full inline-block" />
            進行中
          </span>
          <span className="flex items-center gap-1">
            <span style={{ backgroundColor: "var(--status-confirmed-text)" }} className="w-1.5 h-1.5 rounded-full inline-block" />
            確定
          </span>
        </div>

        <details open>
          <summary className="text-[11px] text-faint mb-1 mt-3 cursor-pointer select-none">要件定義</summary>
          <div className="flex flex-col gap-0.5 mb-4">
            {selectedChapters.map((n) => (
              <Link
                key={n}
                href={`/projects/${id}/chapters/${n}`}
                className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1 flex items-center gap-2"
              >
                {chapterDot(n)}
                {n}. {CHAPTER_NAMES[n]}
              </Link>
            ))}
            <Link
              href={`/projects/${id}/bulk-generate`}
              className="text-xs text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1"
            >
              AI素案を一括生成
            </Link>
          </div>
        </details>

        <details open>
          <summary className="text-[11px] text-faint mb-1 cursor-pointer select-none">確定判定</summary>
          <div className="flex flex-col gap-0.5 mb-4">
            <Link href={`/projects/${id}/readiness`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              確定判定ダッシュボード
            </Link>
            <Link href={`/projects/${id}/consistency`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              整合性チェック（全体）
            </Link>
            <Link href={`/projects/${id}/baseline`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              ベースライン
            </Link>
            <Link href={`/projects/${id}/changes`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              差分管理
            </Link>
          </div>
        </details>

        <details open>
          <summary className="text-[11px] text-faint mb-1 cursor-pointer select-none">案件管理</summary>
          <div className="flex flex-col gap-0.5">
            <Link href={`/projects/${id}/documents`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              資料
            </Link>
            <Link href={`/projects/${id}/business-flow`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              業務フロー
            </Link>
            <Link href={`/projects/${id}/effort`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              工数記録
            </Link>
            <Link href={`/projects/${id}/members`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              メンバー
            </Link>
            <Link href={`/projects/${id}/settings`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
              案件設定
            </Link>
          </div>
        </details>
      </nav>

      <main className="flex-1 overflow-x-auto">{children}</main>
    </div>
  );
}
