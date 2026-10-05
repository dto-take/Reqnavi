"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { fetchAllPages } from "@/lib/paged-select";
import { revalidatePath } from "next/cache";

export type CrossProjectItem = {
  id: string;
  project_id: string;
  content: Record<string, string>;
  template_type: string;
  projects: { name: string } | null;
};

export type CrossProjectReferences = {
  items: CrossProjectItem[];
  // 自案件が参照を有効にしているか。無効なら一覧は常に空
  ownEnabled: boolean;
  // 参照元になれる案件（同じ顧客・オプトイン済みの他案件）の数
  sourceProjects: number;
};

// 横断参照の仕様（権限と可視性の条件はアクション側で明示的に課す）：
//   ・自案件と参照元の案件が同じ顧客であること
//   ・双方の案件がオプトイン（allow_cross_project_reference）済みであること
//   ・対象は確定済み（confirmed・exception_approved）の項目のみ（不採用・未確定は含めない）
// RLS（requirement_items_cross_project_select）は非メンバー向けにこれと同じ条件を課すが、
// 利用者が参照元の案件のメンバーでもある場合は、メンバー用ポリシーとの論理和で全行が読めてしまう。
// そのためRLSに任せず、メンバーかどうかに関わらず同じ条件をここで課す（規約64）。
const REFERENCEABLE_STATUSES = ["confirmed", "exception_approved"];

type ProjectRow = { id: string; organization_id: string | null; allow_cross_project_reference: boolean };

async function loadOwnProject(supabase: Awaited<ReturnType<typeof createServerActionClient>>, projectId: string) {
  const { data } = await supabase
    .from("projects")
    .select("id, organization_id, allow_cross_project_reference")
    .eq("id", projectId)
    .maybeSingle();
  return data as unknown as ProjectRow | null;
}

export async function listCrossProjectReferences(currentProjectId: string, chapterNo: number): Promise<CrossProjectReferences> {
  const supabase = await createServerActionClient();
  const own = await loadOwnProject(supabase, currentProjectId);
  if (!own) return { items: [], ownEnabled: false, sourceProjects: 0 };
  if (!own.allow_cross_project_reference || !own.organization_id) return { items: [], ownEnabled: own.allow_cross_project_reference, sourceProjects: 0 };

  const { data: others } = await supabase
    .from("projects")
    .select("id, organization_id, allow_cross_project_reference")
    .eq("organization_id", own.organization_id)
    .eq("allow_cross_project_reference", true)
    .neq("id", currentProjectId);
  const sourceIds = ((others ?? []) as unknown as ProjectRow[]).map((p) => p.id);
  if (sourceIds.length === 0) return { items: [], ownEnabled: true, sourceProjects: 0 };

  // 他案件の確定済み項目は件数に上限が無いため、ページングする（規約62）
  const items = await fetchAllPages<CrossProjectItem>((from, to) =>
    supabase
      .from("requirement_items")
      .select("id, project_id, content, template_type, projects(name)")
      .in("project_id", sourceIds)
      .in("status", REFERENCEABLE_STATUSES)
      .eq("chapter_no", chapterNo)
      .order("id")
      .range(from, to)
  );
  return { items, ownEnabled: true, sourceProjects: sourceIds.length };
}

// 取り込みは、クライアントから渡された内容ではなく、参照元の項目のidだけを受け取り、
// 上記の条件をすべて確認したうえで、参照元の内容をサーバー側で読んで複製する。
export async function copyReferenceItem(currentProjectId: string, chapterNo: number, sourceItemId: string) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  const own = await loadOwnProject(supabase, currentProjectId);
  if (!own) throw new UserFacingError("案件が見つかりません");
  if (!own.allow_cross_project_reference || !own.organization_id) {
    throw new UserFacingError("他案件の参照は、双方の案件で有効にしたときに利用できます");
  }

  const { data: srcData } = await supabase
    .from("requirement_items")
    .select("id, project_id, chapter_no, template_type, content, status")
    .eq("id", sourceItemId)
    .maybeSingle();
  const src = srcData as unknown as {
    id: string;
    project_id: string;
    chapter_no: number;
    template_type: string;
    content: Record<string, string>;
    status: string;
  } | null;
  if (!src || src.project_id === currentProjectId || src.chapter_no !== chapterNo) {
    throw new UserFacingError("参照元の項目が見つかりません");
  }
  if (!REFERENCEABLE_STATUSES.includes(src.status)) throw new UserFacingError("確定済みの項目のみ取り込めます");

  const srcProject = await loadOwnProject(supabase, src.project_id);
  if (!srcProject || srcProject.organization_id !== own.organization_id || !srcProject.allow_cross_project_reference) {
    throw new UserFacingError("他案件の参照は、双方の案件で有効にしたときに利用できます");
  }

  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: currentProjectId,
      tenant_id: tenantId,
      chapter_no: chapterNo,
      template_type: src.template_type,
      content: src.content,
      status: "ai_draft",
    })
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  if (!data || data.length === 0) throw new UserFacingError("取り込みに失敗しました");
  revalidatePath(`/projects/${currentProjectId}/chapters/${chapterNo}`);
}
