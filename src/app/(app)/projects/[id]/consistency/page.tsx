import { checkOrphanItems, checkUnreflectedSteps } from "@/actions/consistency";
import { Card } from "@/components/ui/card";

export default async function ProjectConsistencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orphans, unreflected] = await Promise.all([
    checkOrphanItems(id),
    checkUnreflectedSteps(id),
  ]);

  return (
    <div className="max-w-2xl mx-auto mt-10 flex flex-col gap-6">
      <Card>
        <h1 className="text-base font-semibold text-primary mb-1">全体整合性チェック：孤立要件</h1>
        <p className="text-xs text-secondary mb-4">案件全体で、出典が紐付いていない項目（{orphans.length}件）</p>
        {orphans.length === 0 ? (
          <p className="text-sm text-secondary">孤立している項目はありません</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {orphans.map((o) => (
              <li key={o.id} className="text-sm text-(--status-needhearing-text) bg-(--status-needhearing-bg) rounded-md px-3 py-2">
                {o.chapterNo}章：{o.name}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-primary mb-1">全体整合性チェック：未反映ステップ</h2>
        <p className="text-xs text-secondary mb-4">
          業務フローTo-Beの新設ステップのうち、機能要件（9章）にまだ反映されていないもの（{unreflected.length}件）
        </p>
        {unreflected.length === 0 ? (
          <p className="text-sm text-secondary">未反映のステップはありません</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5 mb-3">
              {unreflected.map((s) => (
                <li key={s.id} className="text-sm text-(--status-review-text) bg-(--status-review-bg) rounded-md px-3 py-2">
                  {s.label}
                </li>
              ))}
            </ul>
            <a href={`/projects/${id}/business-flow/diff`} className="text-xs text-secondary underline">
              業務フロー差分確認画面で反映する
            </a>
          </>
        )}
      </Card>
    </div>
  );
}
