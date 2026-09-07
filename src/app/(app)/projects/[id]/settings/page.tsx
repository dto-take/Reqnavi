import { createServerActionClient } from "@/lib/supabase/server";
import { toggleCrossProjectReference, updateSelectedChapters } from "@/actions/project-settings";
import { CHAPTER_NAMES } from "@/lib/chapters";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectDangerZone } from "@/components/domain/project-danger-zone";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const canEdit = ["admin", "pm"].includes(claims?.claims?.user_role as string);

  const { data: projectData } = await supabase
    .from("projects")
    .select("name, allow_cross_project_reference, selected_chapters")
    .eq("id", id)
    .single();
  const project = projectData as unknown as {
    name: string;
    allow_cross_project_reference: boolean;
    selected_chapters: number[];
  } | null;

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card>
        <PageHeader title="案件設定" />

        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm text-primary">同一顧客内の他案件参照</div>
            <p className="text-xs text-secondary mt-0.5">
              有効にすると、同じ顧客組織の他案件（同様に有効化している場合のみ）の確定済み項目を参照できます
            </p>
          </div>
        </div>

        {canEdit ? (
          <form action={toggleCrossProjectReference.bind(null, id)}>
            <input type="hidden" name="enabled" value={project?.allow_cross_project_reference ? "false" : "true"} />
            <Button type="submit" variant="secondary" size="md">
              {project?.allow_cross_project_reference ? "無効にする" : "有効にする"}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-faint">変更にはPM以上の権限が必要です</p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-primary mb-1">対象章の管理</h2>
        <p className="text-xs text-secondary mb-3">
          チェックを外した章はサイドバー・各種集計から除外されます（データ自体は削除されません。再度チェックすれば復元されます）。
        </p>
        {canEdit ? (
          <form action={updateSelectedChapters.bind(null, id)} className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {Object.entries(CHAPTER_NAMES).map(([n, name]) => (
                <label key={n} className="text-xs px-2 py-1 rounded bg-hover text-primary flex items-center gap-1">
                  <input type="checkbox" name="chapters" value={n} defaultChecked={project?.selected_chapters?.includes(Number(n))} />
                  {n}.{name}
                </label>
              ))}
            </div>
            <SubmitButton size="sm" pendingText="更新中...">更新</SubmitButton>
          </form>
        ) : (
          <p className="text-xs text-faint">変更にはPM以上の権限が必要です</p>
        )}
      </Card>

      {canEdit && claims?.claims?.user_role === "admin" && (
        <ProjectDangerZone projectId={id} projectName={project?.name ?? ""} />
      )}
    </div>
  );
}
