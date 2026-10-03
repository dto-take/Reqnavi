import type { ProjectSummary } from "@/lib/project-list/derive";
import { CHAPTER_NAMES } from "@/lib/chapters";

// 章の進捗セグメント：その案件の対象章だけを並べる。確定＝緑／作成中＝琥珀／未着手＝灰。
// 赤は使わない（低進捗を警告色にしない）。色だけに頼らず、role="img"とaria-labelで内容を伝える。
const COLOR = {
  confirmed: "var(--brand)",
  in_progress: "var(--status-review-text)",
  not_started: "var(--border)",
} as const;
const LABEL = { confirmed: "確定", in_progress: "作成中", not_started: "未着手" } as const;

export function ChapterSegments({ summary, className = "" }: { summary: ProjectSummary; className?: string }) {
  const n = summary.chapters.length;
  return (
    <div
      role="img"
      aria-label={`${n}章中、${summary.confirmedChapters}章が確定、${summary.workingChapters}章が作成中`}
      className={`flex gap-0.5 ${className}`}
      data-chapter-segments
    >
      {summary.chapters.map((c) => (
        <span
          key={c.chapterNo}
          data-chapter-segment={c.status}
          title={`${c.chapterNo}. ${CHAPTER_NAMES[c.chapterNo]}：${LABEL[c.status]}`}
          className="flex-1 h-1.5 rounded-sm min-w-0.5"
          style={{ backgroundColor: COLOR[c.status] }}
        />
      ))}
    </div>
  );
}
