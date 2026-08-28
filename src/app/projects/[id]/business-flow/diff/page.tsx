import Link from "next/link";
import { getFlowDiff, proposeFunctionalRequirements } from "@/actions/flow-diff";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function FlowDiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { newSteps, removedSteps } = await getFlowDiff(id);
  const propose = proposeFunctionalRequirements.bind(null, id);

  return (
    <div className="max-w-2xl mx-auto mt-10 flex flex-col gap-6">
      <Link href={`/projects/${id}/business-flow`} className="text-xs text-secondary underline">
        ← 業務フローに戻る
      </Link>
      <Card>
        <h1 className="text-base font-semibold text-primary mb-1">
          To-Beで新設されたステップ
        </h1>
        <p className="text-xs text-secondary mb-4">
          選択して「機能要件へ反映」を押すと、9章に素案（AI素案ステータス）として追加されます
        </p>

        {newSteps.length === 0 ? (
          <p className="text-sm text-secondary">新設されたステップはありません</p>
        ) : (
          <form action={propose}>
            <div className="flex flex-col gap-2 mb-4">
              {newSteps.map((step) => (
                <label key={step.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="step"
                    value={JSON.stringify({ id: step.id, label: step.label })}
                    defaultChecked
                  />
                  {step.label}
                  <span className="text-xs text-faint">（{step.role_lane}）</span>
                </label>
              ))}
            </div>
            <Button type="submit" variant="primary" size="md">機能要件へ反映</Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-primary mb-1">
          As-Isから削除されたステップ（参考情報）
        </h2>
        <p className="text-xs text-secondary mb-3">
          既存の機能要件への影響有無はSE自身でご確認ください（自動判定は行いません）
        </p>
        {removedSteps.length === 0 ? (
          <p className="text-sm text-secondary">削除されたステップはありません</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {removedSteps.map((step) => (
              <li key={step.id} className="text-sm text-secondary">
                {step.label}（{step.role_lane}）
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
