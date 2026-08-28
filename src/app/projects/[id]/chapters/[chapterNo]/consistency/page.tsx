import Link from "next/link";
import { checkOrphanItems } from "@/actions/consistency";
import { Card } from "@/components/ui/card";
import { CHAPTER_NAMES } from "@/lib/chapters";

export default async function ChapterConsistencyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chapterNo: string }>;
  searchParams: Promise<{ item_id?: string }>;
}) {
  const { id, chapterNo } = await params;
  const { item_id } = await searchParams;
  const chapterNum = Number(chapterNo);

  const orphans = await checkOrphanItems(id, chapterNum);
  const filtered = item_id ? orphans.filter((o) => o.id === item_id) : orphans;

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <Link href={`/projects/${id}/chapters/${chapterNum}`} className="text-xs text-secondary underline mb-3 inline-block">
        ← {chapterNum}. {CHAPTER_NAMES[chapterNum]}に戻る
      </Link>
      <h1 className="text-base font-semibold text-primary mb-1">
        {item_id ? "項目チェック" : "章の整合性チェック"}
      </h1>
      <p className="text-xs text-secondary mb-4">出典（根拠資料）が紐付いていない項目を表示します</p>

      {filtered.length === 0 ? (
        <p className="text-sm text-secondary">
          {item_id ? "この項目には孤立の問題はありません" : "孤立している項目はありません"}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((o) => (
            <li key={o.id} className="text-sm text-(--status-needhearing-text) bg-(--status-needhearing-bg) rounded-md px-3 py-2">
              {o.name}（出典なし）
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
