import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { countUnclassifiedDocuments } from "@/actions/documents";
import { CHAPTER_NAMES, CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";
import { BulkGenerateZone } from "@/components/domain/bulk-generate-zone";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function BulkGeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  const { data: project } = await supabase.from("projects").select("selected_chapters").eq("id", id).single();
  const selectedChapters = (project?.selected_chapters as number[]) ?? [];
  const unclassifiedCount = await countUnclassifiedDocuments(id);

  const chapters = selectedChapters
    .filter((n) => CHAPTER_TEMPLATE_MAP[n])
    .sort((a, b) => a - b)
    .map((n) => ({
      chapterNo: n,
      chapterName: CHAPTER_NAMES[n],
      templateType: CHAPTER_TEMPLATE_MAP[n] as "A" | "B" | "C",
    }));

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <PageHeader title="AI素案の一括生成" />
      <p className="text-xs text-secondary mb-4">
        テンプレートA/B/C（4章KPI・10章非機能要件・15章進捗は対象外）の章から選択し、まとめてAI素案を生成します。処理は1章ずつ順番に行われます。
      </p>
      <p className="text-xs text-secondary mb-4" data-bulk-generate-note>
        選んだ章では、「AI素案（未確認）」のまま人の手が入っていない項目だけが削除され、新しい素案に置き換わります。
        「確認中」「確定」「例外承認」「不採用」にした項目は上書きされず、そのまま残ります。
      </p>
      {unclassifiedCount > 0 && (
        <p data-unclassified-note className="text-xs mb-4 rounded-md px-3 py-2" style={{ color: "var(--status-review-text)", background: "var(--status-review-bg)" }}>
          分類されていない資料が{unclassifiedCount}件あります。再分類するまで、AI素案の生成には使われません。
        </p>
      )}
      <BulkGenerateZone projectId={id} tenantId={tenantId ?? ""} chapters={chapters} />
    </Card>
  );
}
