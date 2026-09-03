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
};

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documents = (await listDocuments(id)) as unknown as SourceDocument[] | null;

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <PageHeader title="資料" />

      <div className="mb-5">
        <DocumentUploadZone projectId={id} />
      </div>

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
