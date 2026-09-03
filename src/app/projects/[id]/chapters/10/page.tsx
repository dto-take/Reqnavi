import { listChecklistCategories, createChecklistCategory } from "@/actions/nonfunctional-checklist";
import { generateNonFunctionalDraft } from "@/actions/ai-draft-nonfunctional";
import { ChecklistCard } from "@/components/domain/nonfunctional-checklist/ChecklistCard";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { InlineErrorForm } from "@/components/ui/inline-error-form";
import { AiGenerateButton } from "@/components/domain/ai-generate-button";

const DEFAULT_CATEGORIES = ["可用性", "性能拡張性", "運用保守性", "移植性", "セキュリティ"];

export default async function NonFunctionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await listChecklistCategories(id);

  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  const draftNonFunctional = generateNonFunctionalDraft.bind(null, id, tenantId ?? "");

  const existingCategories = rows.map((r) => r.content.category);
  const missingCategories = DEFAULT_CATEGORIES.filter((c) => !existingCategories.includes(c));

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-semibold text-primary">10. 非機能要件</h1>
        <InlineErrorForm action={draftNonFunctional} successMessage="AI素案を生成しました">
          <AiGenerateButton />
        </InlineErrorForm>
      </div>

      {rows.map((row) => (
        <ChecklistCard key={row.id} projectId={id} row={row} />
      ))}

      {missingCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {missingCategories.map((cat) => (
            <form key={cat} action={createChecklistCategory.bind(null, id, tenantId ?? "", cat)}>
              <Button type="submit" variant="secondary" size="sm">+ {cat}を追加</Button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
