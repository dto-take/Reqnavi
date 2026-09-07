import Link from "next/link";
import {
  listColumnDefs,
  listRequirementItems,
  createRequirementItem,
} from "@/actions/requirement-items";
import { generateDraft } from "@/actions/ai-draft";
import { runAmbiguousCheck, runAmbiguousCheckAI } from "@/actions/ambiguous-check";
import { RequirementTable } from "@/components/domain/requirement-table/RequirementTable";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { CHAPTER_NAMES, CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { AiGenerateButton } from "@/components/domain/ai-generate-button";
import { InlineErrorForm } from "@/components/ui/inline-error-form";

// 4章（KPI・テンプレートD）、10章（非機能要件・テンプレートE）、15章（進捗・ガントチャート）は
// CHAPTER_TEMPLATE_MAPに意図的に含まれていない。これらの章は chapters/4, chapters/10, chapters/15
// の固定ルートで専用ページを持つ（Next.jsは同階層で静的セグメントを動的セグメント[chapterNo]より
// 優先してマッチさせるため、両者は競合しない。万一この動的ルート側に4・10・15が来ても、
// マップに無いため後述の未対応表示になる）。

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterNo: string }>;
}) {
  const { id, chapterNo } = await params;
  const chapterNum = Number(chapterNo);
  const templateType = CHAPTER_TEMPLATE_MAP[chapterNum];

  if (!templateType) {
    return <div className="p-6 text-sm text-secondary">この章はまだ対応していません（テンプレートA・B・C以外は未実装）。</div>;
  }

  const [columns, items] = await Promise.all([
    listColumnDefs(templateType, chapterNum),
    listRequirementItems(id, chapterNum),
  ]);

  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  const { data: claims } = await supabase.auth.getClaims();
  // CLAUDE.md規約6：組織横断機能（Phase4）はパートナーには一切見せない。
  // RLS（can_view_cross_project_item）側でも参照データ自体は空になるが、
  // 常に空になる導線をパートロールに見せないよう、リンク自体も出さない。
  const isPartner = claims?.claims?.user_role === "partner";
  const addItem = createRequirementItem.bind(null, id, tenantId ?? "", chapterNum, templateType);
  const draftItems = generateDraft.bind(null, id, tenantId ?? "", chapterNum, templateType as "A" | "B" | "C");

  const { data: project } = await supabase.from("projects").select("selected_chapters").eq("id", id).single();
  const selectedChapters = ((project?.selected_chapters as number[]) ?? []).slice().sort((a, b) => a - b);
  const currentPos = selectedChapters.indexOf(chapterNum);
  const prevChapter = currentPos > 0 ? selectedChapters[currentPos - 1] : null;
  const nextChapter = currentPos >= 0 && currentPos < selectedChapters.length - 1 ? selectedChapters[currentPos + 1] : null;

  return (
    <div className="max-w-6xl mx-auto mt-10">
      <PageHeader
        title={`${chapterNum}. ${CHAPTER_NAMES[chapterNum]}`}
        action={
          <div className="flex gap-2">
            <InlineErrorForm action={draftItems} successMessage="AI素案を生成しました">
              <AiGenerateButton />
            </InlineErrorForm>
            <form action={runAmbiguousCheck.bind(null, id, chapterNum)}>
              <SubmitButton variant="secondary" size="sm" pendingText="チェック中...">曖昧表現チェック</SubmitButton>
            </form>
            <InlineErrorForm action={runAmbiguousCheckAI.bind(null, id, chapterNum)} successMessage="AI曖昧判定が完了しました">
              <SubmitButton variant="secondary" size="sm" pendingText="AIが判定中...">AI曖昧判定（詳細）</SubmitButton>
            </InlineErrorForm>
            <form action={addItem}>
              <Button type="submit" variant="secondary" size="sm">+ 行を追加</Button>
            </form>
          </div>
        }
      />
      {chapterNum === 9 && (
        <div className="flex gap-4 mb-3">
          <a href={`/projects/${id}/chapters/9/screens`} className="text-sm text-secondary underline">
            画面イメージを見る
          </a>
          <a href={`/projects/${id}/chapters/9/screen-transitions`} className="text-sm text-secondary underline">
            画面遷移図を見る
          </a>
        </div>
      )}
      {!isPartner && (
        <a href={`/projects/${id}/chapters/${chapterNum}/cross-reference`} className="text-xs text-secondary underline">
          他案件から参照
        </a>
      )}
      <RequirementTable
        projectId={id}
        chapterNo={chapterNum}
        columns={columns}
        items={items}
        showPlatformSuggestion={chapterNum === 9}
      />
      <div className="flex justify-between mt-6 pt-4 border-t border-border">
        {prevChapter ? (
          <Link href={`/projects/${id}/chapters/${prevChapter}`} className="text-sm text-secondary hover:text-primary">
            ← {prevChapter}. {CHAPTER_NAMES[prevChapter]}
          </Link>
        ) : <span />}
        {nextChapter ? (
          <Link href={`/projects/${id}/chapters/${nextChapter}`} className="text-sm text-secondary hover:text-primary">
            {nextChapter}. {CHAPTER_NAMES[nextChapter]} →
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}
