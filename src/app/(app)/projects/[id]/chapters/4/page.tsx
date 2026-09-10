import { listKpiTree } from "@/actions/kpi-tree";
import { generateKpiDraft } from "@/actions/ai-draft-kpi";
import { KpiTree } from "@/components/domain/kpi-tree/KpiTree";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { InlineErrorForm } from "@/components/ui/inline-error-form";
import { AiGenerateButton } from "@/components/domain/ai-generate-button";

export default async function KpiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodes = await listKpiTree(id);

  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  const draftKpi = generateKpiDraft.bind(null, id, tenantId ?? "");

  return (
    // kpi_pane_width.md Step3：編集ペインの余白過多の実際の原因はKpiDetailPane.tsx自体では
    // なく、このページ全体を囲むmax-w-3xl（768px）だった（他の章ページ（chapters/[chapterNo]）
    // はmax-w-6xlを使っており、KPI章だけ狭いのは既存の不整合）。2ペインレイアウトが
    // 実際に活かせる幅を確保するため、他章ページと同じmax-w-6xlに合わせる。
    <div className="max-w-6xl mx-auto mt-10">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-semibold text-primary">4. KPI</h1>
        <InlineErrorForm action={draftKpi} successMessage="AI素案を生成しました">
          <AiGenerateButton />
        </InlineErrorForm>
      </div>
      <KpiTree projectId={id} tenantId={tenantId ?? ""} nodes={nodes} />
    </div>
  );
}
