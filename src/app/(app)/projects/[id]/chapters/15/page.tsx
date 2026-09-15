import { listProgressTasks } from "@/actions/progress-tasks";
import { listProjectMembers } from "@/actions/projects";
import { ProgressChart } from "@/components/domain/progress/ProgressChart";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";

type MemberRow = { user_profiles: { display_name: string | null } | null };

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await listProgressTasks(id);
  const members = await listProjectMembers(id);

  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);

  const memberNames = Array.from(
    new Set(
      (members as unknown as MemberRow[])
        .map((m) => m.user_profiles?.display_name)
        .filter((name): name is string => !!name)
    )
  );

  return (
    <div className="max-w-6xl mx-auto mt-10">
      <ProgressChart projectId={id} tenantId={tenantId ?? ""} nodes={tasks} memberNames={memberNames} />
    </div>
  );
}
