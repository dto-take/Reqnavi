import type { getProjectOverview } from "@/actions/project-overview";
import { CHAPTER_NAMES } from "@/lib/chapters";

export type NextAction = { message: string; href: string; linkLabel: string };

export function computeNextAction(overview: Awaited<ReturnType<typeof getProjectOverview>>): NextAction {
  if (overview.documentCount === 0) {
    return { message: "まだ資料がアップロードされていません。まずは資料を格納しましょう。", href: "documents", linkLabel: "資料をアップロードする" };
  }
  const noItemChapters = overview.readiness.filter((r) => r.totalItems === 0);
  if (noItemChapters.length > 0) {
    const first = noItemChapters[0];
    const remainingCount = noItemChapters.length - 1;
    const label = `「${first.chapterNo}. ${CHAPTER_NAMES[first.chapterNo]}」`;
    // 4章はKPIノード、10章は採用中の観点が確定判定の単位（5章以降の項目とは文言を分ける）
    const body =
      first.chapterNo === 4
        ? `${label}にKPIがまだありません。KPIツリーを作成しましょう。`
        : first.chapterNo === 10
          ? `${label}で採用中の観点がまだありません。観点を確認して採用しましょう。`
          : `${label}でまだ要件項目がありません。AI素案を生成しましょう。`;
    return {
      message: `${body}${remainingCount > 0 ? `（他${remainingCount}章も未着手）` : ""}`,
      href: `chapters/${first.chapterNo}`,
      linkLabel: "章を開く",
    };
  }
  if (overview.avgReadiness < 80) {
    return { message: `平均充足率が${overview.avgReadiness}%です。曖昧表現チェック・確定作業を進めましょう。`, href: "readiness", linkLabel: "確定判定ダッシュボードを見る" };
  }
  if (!overview.baseline) {
    return { message: "充足率が高い状態です。ベースラインの確定を検討しましょう。", href: "baseline", linkLabel: "ベースラインを確定する" };
  }
  if (overview.openChangeCount > 0) {
    return { message: `未対応の変更申請が${overview.openChangeCount}件あります。`, href: "changes", linkLabel: "差分管理を確認する" };
  }
  return { message: "現時点で特に対応が必要な項目はありません。", href: "readiness", linkLabel: "確定判定ダッシュボードを見る" };
}
