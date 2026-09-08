import Link from "next/link";
import { listWorkflowNodes } from "@/actions/workflow-builder";
import { WorkflowBuilderClient } from "@/components/domain/workflow-builder/WorkflowBuilderClient";
import { PageHeader } from "@/components/ui/page-header";

export default async function WorkflowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodes = await listWorkflowNodes(id);

  return (
    <div className="max-w-[1400px] mx-auto mt-8 px-4">
      <Link href={`/projects/${id}/business-flow`} className="text-xs text-secondary underline mb-3 inline-block">
        ← 業務フローに戻る
      </Link>
      <PageHeader title="業務フロービルダー（ベータ）" />
      <WorkflowBuilderClient projectId={id} initialNodes={nodes} />
    </div>
  );
}
