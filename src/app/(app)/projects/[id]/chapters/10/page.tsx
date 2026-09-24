import { listAspectMaster, listNonfunctionalNodes } from "@/actions/nonfunctional";
import { NonfunctionalScreen } from "@/components/domain/nonfunctional-checklist/NonfunctionalScreen";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";

export default async function NonFunctionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [master, nodes] = await Promise.all([listAspectMaster(), listNonfunctionalNodes(id)]);

  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);

  return (
    <div className="max-w-6xl mx-auto mt-10">
      <NonfunctionalScreen projectId={id} tenantId={tenantId ?? ""} master={master} nodes={nodes} />
    </div>
  );
}
