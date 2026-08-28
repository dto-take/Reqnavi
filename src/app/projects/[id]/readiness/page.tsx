import { getReadinessSummary } from "@/actions/readiness";
import { CHAPTER_NAMES } from "@/lib/chapters";
import { readinessBarColor } from "@/lib/readiness-color";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function ReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = await getReadinessSummary(id);

  const lowChapters = summary.filter((s) => s.readinessRate < 50 || s.ambiguousCount > 3);

  return (
    <Card className="max-w-3xl mx-auto mt-10">
      <PageHeader title="要件確定判定ダッシュボード" />

      <div className="grid grid-cols-4 gap-2 text-xs text-secondary px-2 mb-1">
        <span>章</span>
        <span>充足率</span>
        <span>曖昧表現</span>
        <span>要ヒアリング</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {summary.map((s) => (
          <div key={s.chapterNo} className="grid grid-cols-4 items-center bg-sidebar rounded-md px-3 py-2 text-sm">
            <span>{s.chapterNo}. {CHAPTER_NAMES[s.chapterNo]}</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div style={{ width: `${s.readinessRate}%`, backgroundColor: readinessBarColor(s.readinessRate) }} className="h-full" />
              </div>
              <span className="text-xs text-secondary w-9">{s.readinessRate}%</span>
              <span className="text-[10px] text-[#6E5A9E]">
                {s.exceptionApprovedCount > 0 ? `（うち例外承認 ${s.exceptionApprovedCount}件）` : ""}
              </span>
            </div>
            <span className={s.ambiguousCount > 3 ? "text-(--status-needhearing-text)" : "text-secondary"}>{s.ambiguousCount}件</span>
            <span className={s.needHearingCount > 0 ? "text-(--status-review-text)" : "text-secondary"}>{s.needHearingCount}件</span>
          </div>
        ))}
      </div>

      {lowChapters.length > 0 && (
        <div className="mt-4 p-3 bg-(--status-needhearing-bg) rounded-md text-xs text-(--status-needhearing-text)">
          充足率が低い、または曖昧表現の多い章があります。この状態での確定・見積りは推奨されません。
        </div>
      )}
    </Card>
  );
}
