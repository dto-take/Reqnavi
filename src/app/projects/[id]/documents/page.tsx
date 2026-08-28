import { listDocuments, uploadDocument, reclassifyDocument } from "@/actions/documents";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { InlineErrorForm } from "@/components/ui/inline-error-form";

type SourceDocument = {
  id: string;
  file_name: string;
  classified_tags: string[];
  storage_path: string;
};

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documents = (await listDocuments(id)) as unknown as SourceDocument[] | null;
  const uploadWithId = uploadDocument.bind(null, id);

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <PageHeader title="資料" />

      <InlineErrorForm action={uploadWithId} className="flex items-center gap-2 mb-5 flex-wrap" successMessage="資料をアップロードしました">
        <input
          type="file"
          name="file"
          required
          className="text-sm flex-1 border border-border rounded-md px-2 py-1.5 bg-page"
        />
        <SubmitButton variant="primary" size="md" pendingText="分類中...">アップロード</SubmitButton>
      </InlineErrorForm>

      <div className="flex flex-col">
        {documents?.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-2.5 border-t border-hover">
            <span className="text-sm text-primary">{d.file_name}</span>
            <div className="flex items-center gap-1">
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
