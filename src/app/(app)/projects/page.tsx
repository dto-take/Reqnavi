import Link from "next/link";
import { listProjectsForList } from "@/actions/projects";
import { ProjectListScreen } from "@/components/domain/project-list/ProjectListScreen";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";

// 案件一覧（project_list_ux.md）：全案件分のデータを1回で取得してクライアントへ渡し、検索・顧客・
// 状態・並べ替え・表示形式はクライアント側で即時に反映する。
// ?customer=（顧客ID）は顧客セレクトの初期値。旧?org=も同じ意味で受け付ける。?view=は無視する。
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; org?: string }>;
}) {
  const { customer, org } = await searchParams;
  const projects = await listProjectsForList();

  return (
    <div className="max-w-6xl mx-auto mt-10 px-6">
      <PageHeader
        title="案件一覧"
        action={
          <Link href="/projects/new" className={buttonClasses("primary", "sm")}>
            + 新規案件
          </Link>
        }
      />
      <ProjectListScreen projects={projects} initialCustomerId={customer ?? org ?? ""} />
    </div>
  );
}
