import Link from "next/link";
import { listCrossProjectReferences, copyReferenceItem } from "@/actions/cross-project-reference";
import { CHAPTER_NAMES } from "@/lib/chapters";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function CrossReferencePage({
  params,
}: {
  params: Promise<{ id: string; chapterNo: string }>;
}) {
  const { id, chapterNo } = await params;
  const chapterNum = Number(chapterNo);
  const { items: references, ownEnabled, sourceProjects } = await listCrossProjectReferences(id, chapterNum);

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <Link href={`/projects/${id}/chapters/${chapterNum}`} className="text-xs text-secondary underline mb-3 inline-block">
        ← {chapterNum}. {CHAPTER_NAMES[chapterNum]}に戻る
      </Link>
      <h1 className="text-base font-semibold text-primary mb-1">他案件からの参照</h1>
      <p className="text-xs text-secondary mb-4">
        同一顧客内の他案件（双方で参照を有効化している場合のみ）の確定済み項目（{references.length}件）
      </p>

      {!ownEnabled || sourceProjects === 0 ? (
        <div data-cross-ref-guide className="text-sm text-secondary">
          <p>他案件の参照は、双方の案件で有効にしたときに利用できます。</p>
          <p className="mt-1 text-xs">
            {!ownEnabled ? "この案件で参照が有効になっていません。" : "同じ顧客で参照を有効にしている他の案件がありません。"}
            <Link href={`/projects/${id}/settings`} className="underline ml-1">案件設定を開く</Link>
          </p>
        </div>
      ) : references.length === 0 ? (
        <p className="text-sm text-secondary">参照可能な項目はありません（他案件に、この章の確定済みの項目がありません）</p>
      ) : (
        <div className="flex flex-col gap-2">
          {references.map((r) => (
            <div key={r.id} className="border border-border rounded-md p-3">
              <div className="text-xs text-faint mb-1">{r.projects?.name}</div>
              <div className="text-sm mb-2">{JSON.stringify(r.content)}</div>
              <form action={copyReferenceItem.bind(null, id, chapterNum, r.id)}>
                <Button type="submit" variant="ghost" size="sm">この案件に取り込む（AI素案として）</Button>
              </form>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
