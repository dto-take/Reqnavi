import { listKpiTree } from "@/actions/kpi-tree";
import { KpiTree } from "@/components/domain/kpi-tree/KpiTree";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";

export default async function KpiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodes = await listKpiTree(id);

  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <h1 className="text-base font-semibold text-primary mb-3">4. KPI</h1>
      <KpiTree projectId={id} tenantId={tenantId ?? ""} nodes={nodes} />
    </div>
  );
}
