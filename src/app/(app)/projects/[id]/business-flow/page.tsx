import { listFlowSteps, listFlowEdges, addFlowStep, deleteFlowStep, type FlowType } from "@/actions/business-flow";
import { generateBusinessFlowDraft } from "@/actions/ai-draft-business-flow";
import { SwimlaneDiagramEditor } from "@/components/domain/business-flow/SwimlaneDiagramEditor";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { InlineErrorForm } from "@/components/ui/inline-error-form";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function BusinessFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const flowType: FlowType = tab === "tobe" ? "business_tobe" : "business_asis";

  const steps = await listFlowSteps(id, flowType);
  const edges = await listFlowEdges(id, flowType);
  const addStep = addFlowStep.bind(null, id, flowType);
  const draftFlow = generateBusinessFlowDraft.bind(null, id, flowType);

  return (
    <Card className="max-w-4xl mx-auto mt-10">
      <div className="flex gap-4 border-b border-border mb-4">
        <a
          href="?tab=asis"
          className={`text-sm pb-2 ${flowType === "business_asis" ? "border-b-2 border-primary text-primary font-medium" : "text-secondary"}`}
        >
          As-Is（現状）
        </a>
        <a
          href="?tab=tobe"
          className={`text-sm pb-2 ${flowType === "business_tobe" ? "border-b-2 border-primary text-primary font-medium" : "text-secondary"}`}
        >
          To-Be（改善後）
        </a>
      </div>

      <a href={`/projects/${id}/business-flow/diff`} className="text-sm text-secondary underline mb-4 inline-block">
        As-Is/To-Be差分を確認
      </a>

      {steps.length === 0 && (
        <InlineErrorForm action={draftFlow} className="mb-4">
          <SubmitButton variant="primary" size="md" pendingText="生成中...">AIでステップを生成</SubmitButton>
        </InlineErrorForm>
      )}

      <div className="overflow-x-auto mb-6">
        <SwimlaneDiagramEditor
          key={steps.map((s) => `${s.id}:${s.order_index}:${s.role_lane}`).join(",")}
          projectId={id}
          flowType={flowType}
          steps={steps}
          edges={edges}
        />
      </div>

      <form action={addStep} className="grid grid-cols-4 gap-2 mb-5 items-end">
        <Input name="role_lane" placeholder="担当者" required />
        <Input name="label" placeholder="処理内容" required />
        <Input name="system_used" placeholder="使用システム" />
        <Button type="submit" variant="primary" size="md">+ ステップ追加</Button>
      </form>

      <div className="flex flex-col">
        {steps.map((step, i) => (
          <div key={step.id} className="grid grid-cols-4 items-center py-2 border-t border-hover text-sm">
            <span className="text-secondary">{i + 1}. {step.role_lane}</span>
            <span>{step.label}</span>
            <span className="text-secondary text-xs">{step.system_used}</span>
            <form action={deleteFlowStep.bind(null, step.id, id, flowType)} className="justify-self-end">
              <ConfirmDeleteButton />
            </form>
          </div>
        ))}
      </div>
    </Card>
  );
}
