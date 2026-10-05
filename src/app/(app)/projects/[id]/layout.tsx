import { notFound } from "next/navigation";
import { CHAPTER_NAMES } from "@/lib/chapters";
import { getIsProjectMember, getProjectHeader, getProjectProgressData } from "@/lib/project-data";
import { ProjectSidebar, type SidebarChapter } from "@/components/domain/project-top/ProjectSidebar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ページ本体と同じデータ（React.cacheで共有）。章ドット・確定率・⚠バッジは、確定判定ダッシュボードと
  // 同じ集計（list_project_chapter_stats）・同じ曖昧表現の件数（getAmbiguousCounts）から得る。
  const [header, isMember] = await Promise.all([getProjectHeader(id), getIsProjectMember(id)]);
  // 案件の行が取得できない（存在しない・RLSで見えない・IDの形式が不正）場合は404。サイドバーも出さない。
  // 配下の全画面（章ページ・資料・業務フロー等）に効く。
  if (!header) notFound();
  // メンバーではない案件（行は見える管理者等）は集計が取れないため、進捗は出さない
  const progress = isMember ? await getProjectProgressData(id) : null;

  const chapters: SidebarChapter[] = header.selectedChapters
    .filter((n) => !!CHAPTER_NAMES[n])
    .map((n) => ({
      no: n,
      name: CHAPTER_NAMES[n],
      status: progress && !progress.hiddenChapters.includes(n) ? (progress.statuses[n] ?? "not_started") : null,
      hidden: !!progress && progress.hiddenChapters.includes(n),
      ambiguous: progress && n in progress.ambiguous ? progress.ambiguous[n] : null,
    }));

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <ProjectSidebar projectId={id} projectName={header.name} overall={progress ? progress.overall : null} chapters={chapters} />
      <main className="flex-1 overflow-x-auto">{children}</main>
    </div>
  );
}
