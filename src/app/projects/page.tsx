import Link from "next/link";
import { listProjects, listProjectsReadinessSummary } from "@/actions/projects";
import { listOrganizationsWithProjectCount } from "@/actions/organizations";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/input";
import { Button, buttonClasses } from "@/components/ui/button";
import { readinessBarColor } from "@/lib/readiness-color";

type ProjectListItem = {
  id: string;
  name: string;
  selected_chapters: number[];
  organizations: { id: string; name: string } | null;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; view?: string }>;
}) {
  const { org, view } = await searchParams;
  const viewMode = view === "list" ? "list" : "card";

  const [projectsData, organizations] = await Promise.all([
    listProjects(org),
    listOrganizationsWithProjectCount(),
  ]);
  const projects = (projectsData ?? []) as unknown as ProjectListItem[];
  const readiness = await listProjectsReadinessSummary(projects.map((p) => p.id));

  return (
    <div className="max-w-5xl mx-auto mt-10 px-6">
      <PageHeader
        title="案件一覧"
        action={
          <Link href="/projects/new" className={buttonClasses("primary", "sm")}>
            + 新規案件
          </Link>
        }
      />

      <div className="flex justify-between items-center mb-4">
        <form className="flex gap-2">
          <Select name="org" defaultValue={org ?? ""}>
            <option value="">すべての顧客</option>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <input type="hidden" name="view" value={viewMode} />
          <Button type="submit" variant="secondary" size="md">絞り込む</Button>
        </form>

        <div className="flex gap-1">
          <Link
            href={`/projects?org=${org ?? ""}&view=card`}
            className={`text-xs px-2 py-1 rounded ${viewMode === "card" ? "bg-hover text-primary" : "text-secondary"}`}
          >
            カード
          </Link>
          <Link
            href={`/projects?org=${org ?? ""}&view=list`}
            className={`text-xs px-2 py-1 rounded ${viewMode === "list" ? "bg-hover text-primary" : "text-secondary"}`}
          >
            一覧
          </Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-secondary mb-3">案件がありません</p>
          <Link href="/projects/new" className={buttonClasses("primary", "sm")}>
            最初の案件を作成
          </Link>
        </Card>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const stats = readiness[p.id] ?? { total: 0, confirmed: 0 };
            const rate = stats.total > 0 ? Math.round((stats.confirmed / stats.total) * 100) : 0;
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="block">
                <Card className="h-full hover:border-primary transition-colors">
                  <div className="text-[11px] text-faint mb-1">{p.organizations?.name ?? "―"}</div>
                  <div className="font-medium text-primary mb-3 truncate">{p.name}</div>

                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        style={{ width: `${rate}%`, backgroundColor: readinessBarColor(rate) }}
                        className="h-full"
                      />
                    </div>
                    <span className="text-xs text-secondary w-9 text-right">{rate}%</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-secondary">
                    <span>{p.selected_chapters?.length ?? 0}章 ／ 確定{stats.confirmed}件</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-hover text-secondary">Salesforce</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="flex flex-col">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="grid grid-cols-3 items-center p-2.5 border-t border-hover hover:bg-hover text-sm"
              >
                <span className="font-medium text-primary">{p.name}</span>
                <span className="text-secondary">{p.organizations?.name}</span>
                <span className="text-xs text-faint">{p.selected_chapters?.length ?? 0}章</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
