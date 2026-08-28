import Link from "next/link";
import { getProjectOverview, getRecentKnowledge } from "@/actions/project-overview";
import { getRecentDocuments } from "@/actions/documents";
import { computeNextAction } from "@/lib/next-action";
import { CHAPTER_GROUPS, CHAPTER_NAMES } from "@/lib/chapters";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ProjectHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const overview = await getProjectOverview(id);
  const nextAction = computeNextAction(overview);
  const knowledge = await getRecentKnowledge(id);
  const recentDocuments = await getRecentDocuments(id);

  return (
    <div className="max-w-4xl mx-auto mt-10 flex flex-col gap-4">
      <Card>
        <p className="text-xs text-faint mb-1">{overview.project?.organizations?.name}</p>
        <h1 className="text-lg font-semibold text-primary mb-3">{overview.project?.name}</h1>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xl font-semibold text-primary">{overview.avgReadiness}%</div>
            <div className="text-xs text-secondary">平均充足率</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{overview.documentCount}</div>
            <div className="text-xs text-secondary">資料件数</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{overview.memberCount}</div>
            <div className="text-xs text-secondary">メンバー</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{overview.baseline?.version_no ?? "未確定"}</div>
            <div className="text-xs text-secondary">ベースライン</div>
          </div>
        </div>
      </Card>

      <Card tone="highlight">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs text-secondary mb-1">次にやるべきこと</div>
            <div className="text-sm text-primary">{nextAction.message}</div>
          </div>
          <Link href={`/projects/${id}/${nextAction.href}`}>
            <Button variant="primary" size="sm">{nextAction.linkLabel}</Button>
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-primary mb-3">ステップ</h2>
        <div className="flex flex-col gap-4">
          {CHAPTER_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[11px] text-faint mb-1">{group.label}</div>
              <div className="flex flex-col gap-1">
                {group.chapters
                  .filter((n) => overview.project?.selected_chapters?.includes(n))
                  .map((n) => {
                    const status = overview.chapterStatusMap[n] ?? "not_started";
                    return (
                      <Link key={n} href={`/projects/${id}/chapters/${n}`} className="flex items-center gap-2 text-sm hover:bg-hover rounded px-2 py-1">
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                            status === "confirmed" ? "bg-brand text-white" : status === "in_progress" ? "border-2 border-(--status-review-text)" : "border-2 border-border"
                          }`}
                        >
                          {status === "confirmed" ? "✓" : ""}
                        </span>
                        <span className={status === "not_started" ? "text-faint" : "text-primary"}>
                          {n}. {CHAPTER_NAMES[n]}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-primary mb-3">ナレッジ</h2>

        <div className="mb-4">
          <h3 className="text-xs font-medium text-secondary mb-2">最近確定した項目</h3>
          {knowledge.length === 0 ? (
            <p className="text-sm text-secondary">まだ確定した項目がありません</p>
          ) : (
            <div className="flex flex-col gap-2">
              {knowledge.map((k, i) => (
                <Link
                  key={i}
                  href={`/projects/${id}/chapters/${k.chapterNo}`}
                  className="border-t border-hover pt-2 first:border-t-0 first:pt-0 block hover:bg-hover rounded px-1 -mx-1"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] text-faint">{k.chapterNo}. {CHAPTER_NAMES[k.chapterNo]}</span>
                    <span className="text-[11px] text-faint">
                      {new Date(k.updatedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-primary">{k.summary}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-medium text-secondary mb-2">最近更新された資料</h3>
          {recentDocuments.length === 0 ? (
            <p className="text-sm text-secondary">まだ資料がアップロードされていません</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentDocuments.map((d) => (
                <Link
                  key={d.id}
                  href={`/projects/${id}/documents`}
                  className="border-t border-hover pt-2 first:border-t-0 first:pt-0 flex justify-between items-center hover:bg-hover rounded px-1 -mx-1"
                >
                  <span className="text-sm text-primary truncate">{d.fileName}</span>
                  <span className="text-[11px] text-faint shrink-0 ml-2">
                    {new Date(d.updatedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      <p className="text-xs text-faint text-center">その他の機能はサイドバーからご利用いただけます</p>
    </div>
  );
}
