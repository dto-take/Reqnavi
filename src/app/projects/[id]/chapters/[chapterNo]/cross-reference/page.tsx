import Link from "next/link";
import { listCrossProjectReferences, copyReferenceItem } from "@/actions/cross-project-reference";
import { CHAPTER_NAMES, CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function CrossReferencePage({
  params,
}: {
  params: Promise<{ id: string; chapterNo: string }>;
}) {
  const { id, chapterNo } = await params;
  const chapterNum = Number(chapterNo);
  const templateType = CHAPTER_TEMPLATE_MAP[chapterNum];
  const references = await listCrossProjectReferences(id, chapterNum);

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <Link href={`/projects/${id}/chapters/${chapterNum}`} className="text-xs text-secondary underline mb-3 inline-block">
        ← {chapterNum}. {CHAPTER_NAMES[chapterNum]}に戻る
      </Link>
      <h1 className="text-base font-semibold text-primary mb-1">他案件からの参照</h1>
      <p className="text-xs text-secondary mb-4">
        同一顧客内の他案件（双方で参照を有効化している場合のみ）の確定済み項目（{references.length}件）
      </p>

      {references.length === 0 ? (
        <p className="text-sm text-secondary">参照可能な項目はありません（案件設定で参照を有効化しているかご確認ください）</p>
      ) : (
        <div className="flex flex-col gap-2">
          {references.map((r) => (
            <div key={r.id} className="border border-border rounded-md p-3">
              <div className="text-xs text-faint mb-1">{r.projects?.name}</div>
              <div className="text-sm mb-2">{JSON.stringify(r.content)}</div>
              <form action={copyReferenceItem.bind(null, id, chapterNum, templateType, r.content)}>
                <Button type="submit" variant="ghost" size="sm">この案件に取り込む（AI素案として）</Button>
              </form>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
