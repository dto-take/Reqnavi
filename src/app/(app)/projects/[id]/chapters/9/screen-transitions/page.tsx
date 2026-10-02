import Link from "next/link";
import { listScreenNodes, listScreenEdges } from "@/actions/screen-transition";
import { generateScreenTransitionDraft } from "@/actions/ai-draft-screen-transitions";
import { listRequirementItems } from "@/actions/requirement-items";
import { ScreenFlowScreen } from "@/components/domain/screen-flow/ScreenFlowScreen";
import { PageHeader } from "@/components/ui/page-header";
import { InlineErrorForm } from "@/components/ui/inline-error-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { hasScreenInfo, type FunctionItem } from "@/lib/screen-flow/derive";

export default async function ScreenTransitionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [nodes, edges, items] = await Promise.all([listScreenNodes(id), listScreenEdges(id), listRequirementItems(id, 9)]);
  const draftTransitions = generateScreenTransitionDraft.bind(null, id);

  // 9章の画面情報を持つ項目。F-NNは9章項目に固有の番号が無いため、画面情報を持つ項目の
  // 並び順から導出した表示用の番号。
  const functions: FunctionItem[] = items
    .filter((i) => hasScreenInfo(i.content))
    .map((i, idx) => ({
      id: i.id,
      name: i.content.name ?? "(名称未設定)",
      status: i.status,
      hasScreen: true,
      code: `F-${String(idx + 1).padStart(2, "0")}`,
      pattern: i.content.screen_pattern ?? "",
      fields: (i.content.screen_fields ?? "").split(",").map((f) => f.trim()).filter(Boolean),
      actions: (i.content.screen_actions ?? "").split(",").map((a) => a.trim()).filter(Boolean),
    }));

  return (
    <div className="max-w-[1500px] mx-auto mt-10">
      <Link href={`/projects/${id}/chapters/9`} className="text-xs text-secondary underline mb-3 inline-block">
        ← 9. 機能要件に戻る
      </Link>
      <PageHeader title="画面遷移図" />

      {nodes.length === 0 && (
        <InlineErrorForm action={draftTransitions} className="mb-4">
          <SubmitButton variant="primary" size="md" pendingText="生成中...">
            AIで画面遷移を生成
          </SubmitButton>
        </InlineErrorForm>
      )}

      <ScreenFlowScreen projectId={id} nodes={nodes} edges={edges} functions={functions} />
    </div>
  );
}
