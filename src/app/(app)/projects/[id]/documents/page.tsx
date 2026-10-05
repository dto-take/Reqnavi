import { listDocuments, reclassifyDocument } from "@/actions/documents";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { InlineErrorForm } from "@/components/ui/inline-error-form";
import { DocumentUploadZone } from "@/components/domain/document-upload-zone";

type SourceDocument = {
  id: string;
  file_name: string;
  classified_tags: string[];
  storage_path: string;
  classification_failed: boolean;
};

// タグが空、または分類に失敗した資料は「未分類」（AI素案の生成は分類タグで資料を選ぶため、再分類するまで使われない）
const isUnclassified = (d: SourceDocument) => d.classification_failed || !Array.isArray(d.classified_tags) || d.classified_tags.length === 0;

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documents = (await listDocuments(id)) as unknown as SourceDocument[] | null;
  const unclassifiedCount = (documents ?? []).filter(isUnclassified).length;

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <PageHeader title="資料" />

      <div className="mb-5">
        <DocumentUploadZone projectId={id} />
      </div>

      {unclassifiedCount > 0 && (
        <p data-unclassified-note className="text-xs mb-3 rounded-md px-3 py-2" style={{ color: "var(--status-review-text)", background: "var(--status-review-bg)" }}>
          分類されていない資料が{unclassifiedCount}件あります。再分類するまで、AI素案の生成には使われません。
        </p>
      )}

      <div className="flex flex-col">
        {documents?.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-2.5 border-t border-hover">
            <span className="text-sm text-primary">{d.file_name}</span>
            <div className="flex items-center gap-1">
              {isUnclassified(d) && (
                <span data-unclassified-badge className="text-[11px] px-2 py-0.5 rounded" style={{ color: "var(--status-review-text)", background: "var(--status-review-bg)" }}>
                  未分類
                </span>
              )}
              {d.classified_tags?.map((tag) => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded bg-hover text-secondary">
                  {tag}
                </span>
              ))}
              <InlineErrorForm action={reclassifyDocument.bind(null, d.id, id)} successMessage="再分類しました">
                <SubmitButton variant="ghost" size="sm" pendingText="分類中..." className="ml-1">再分類</SubmitButton>
              </InlineErrorForm>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
