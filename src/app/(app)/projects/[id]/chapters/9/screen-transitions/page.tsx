import Link from "next/link";
import { listScreenNodes, listScreenEdges } from "@/actions/screen-transition";
import { listScreenSuggestions } from "@/actions/screen-flow-suggestions";
import { listRequirementItems } from "@/actions/requirement-items";
import { ScreenFlowScreen } from "@/components/domain/screen-flow/ScreenFlowScreen";
import { PageHeader } from "@/components/ui/page-header";
import { buildFunctionItems } from "@/lib/screen-flow/function-items";

export default async function ScreenTransitionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [nodes, edges, items, suggestions] = await Promise.all([
    listScreenNodes(id),
    listScreenEdges(id),
    listRequirementItems(id, 9),
    listScreenSuggestions(id),
  ]);
  const functions = buildFunctionItems(items.map((i) => ({ id: i.id, status: i.status, content: i.content })));

  return (
    <div className="max-w-[1500px] mx-auto mt-10">
      <Link href={`/projects/${id}/chapters/9`} className="text-xs text-secondary underline mb-3 inline-block">
        ← 9. 機能要件に戻る
      </Link>
      <PageHeader title="画面遷移図" />

      <ScreenFlowScreen projectId={id} nodes={nodes} edges={edges} functions={functions} suggestions={suggestions} />
    </div>
  );
}
