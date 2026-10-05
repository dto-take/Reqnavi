"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { canCreateProject } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchAllPages } from "@/lib/paged-select";
import { hiddenChaptersFor } from "@/lib/permissions";
import { summarizeProject, type ChapterStat, type ListedProject } from "@/lib/project-list/derive";

export type ListedProjectRow = ListedProject & { lastUpdatedByName: string | null };

type StatRow = {
  project_id: string;
  chapter_no: number;
  total_items: number;
  confirmed_items: number;
  exception_items: number;
  last_updated_at: string | null;
  last_updated_by: string | null;
};

// project_list_ux.md：案件一覧用。案件×章の集計はSQL関数（list_project_chapter_stats、security invoker
// なのでRLSがそのまま効く）で行い、項目の行は取得しない（PostgRESTの1000行上限で黙って切り捨てられるため）。
// 関数の返す行数は案件数×章数なので、上限に達しないようページングして全件取得する。
// 最終更新者の名前は、必要なidをまとめて1回で取得する（案件ごとの個別クエリにしない）。
export async function listProjectsForList(): Promise<ListedProjectRow[]> {
  const supabase = await createServerActionClient();
  const { data: projectsData, error } = await supabase
    .from("projects")
    .select("id, name, selected_chapters, organizations(id, name), platform_knowledge_sets(platform_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const projects = projectsData as unknown as {
    id: string;
    name: string;
    selected_chapters: number[] | null;
    organizations: { id: string; name: string } | null;
    platform_knowledge_sets: { platform_name: string } | null;
  }[];
  if (projects.length === 0) return [];

  // 自分がメンバーの案件（メンバー情報で明示的に判定する。集計結果の有無では推測しない）
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  const memberRows = userId
    ? await fetchAllPages<{ project_id: string }>((from, to) =>
        supabase.from("project_members").select("project_id").eq("user_id", userId).order("project_id").range(from, to)
      )
    : [];
  const memberIds = new Set(memberRows.map((m) => m.project_id));

  const stats = await fetchAllPages<StatRow>((from, to) => supabase.rpc("list_project_chapter_stats").range(from, to));
  const statsByProject = new Map<string, ChapterStat[]>();
  for (const r of stats) {
    const list = statsByProject.get(r.project_id) ?? [];
    list.push({
      chapterNo: r.chapter_no,
      totalItems: Number(r.total_items),
      confirmedItems: Number(r.confirmed_items),
      exceptionItems: Number(r.exception_items),
      updatedAt: r.last_updated_at,
      updatedBy: r.last_updated_by,
    });
    statsByProject.set(r.project_id, list);
  }

  const listed = projects.map((p) => ({
    id: p.id,
    name: p.name,
    customerId: p.organizations?.id ?? null,
    customerName: p.organizations?.name ?? "―",
    platform: p.platform_knowledge_sets?.platform_name ?? null,
    summary: summarizeProject(p.selected_chapters ?? [], statsByProject.get(p.id) ?? [], hiddenChaptersFor(claims?.claims?.user_role as string | undefined)),
    isMember: memberIds.has(p.id),
  }));

  const userIds = [...new Set(listed.map((p) => p.summary.lastUpdatedBy).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("user_profiles").select("user_id, display_name").in("user_id", userIds);
    for (const u of (profiles ?? []) as unknown as { user_id: string; display_name: string | null }[]) {
      if (u.display_name) names.set(u.user_id, u.display_name);
    }
  }
  return listed.map((p) => ({ ...p, lastUpdatedByName: p.summary.lastUpdatedBy ? names.get(p.summary.lastUpdatedBy) ?? null : null }));
}

export async function listOrganizations() {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase.from("organizations").select("id, name");
  if (error) throw error;
  return data;
}

export async function createProject(formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!canCreateProject(claims?.claims?.user_role as string | undefined)) {
    // throwすると本番では文言が汎用エラーに潰れるため、画面にエラーを渡して案内する
    redirect(`/projects/new?error=${encodeURIComponent("案件を作成する権限がありません")}`);
  }

  const name = formData.get("name") as string;
  const organizationId = formData.get("organization_id") as string;
  const selectedChapters = formData.getAll("selected_chapters").map(Number);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const tenantId = await getTenantId(supabase);
  if (!tenantId) redirect("/login");

  // projects_selectは作成直後のpm自身には許可されていないため、insertにRETURNINGを
  // 発生させる.select()は使わずid採番済みで挿入する（さもないとINSERT自体がRLSで弾かれる）。
  const projectId = crypto.randomUUID();
  const { error } = await supabase.from("projects").insert({
    id: projectId,
    name,
    organization_id: organizationId,
    selected_chapters: selectedChapters,
    tenant_id: tenantId,
  });

  if (error) {
    redirect(`/projects/new?error=${encodeURIComponent(errorMessage(error))}`);
  }

  // 作成者を自動的にproject_membersへ登録。
  // project_members_insertはis_project_member(project_id)を要求するようになったが、
  // 作成直後の本人はまだメンバーではないため、この初回登録のみservice_roleで行う
  // （identity_gaps_fixで判明。対象はcreateProject内で確定済みのuser_id/project_idのみで、
  // 外部から任意の値を注入できる経路ではない）。
  const admin = createAdminClient();
  const { error: memberError } = await admin.from("project_members").insert({
    project_id: projectId,
    user_id: userData.user.id,
  });
  if (memberError) throw memberError;

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function getProjectDetail(projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, selected_chapters, organizations(name)")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return data;
}

export async function listProjectMembers(projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, user_profiles(display_name, user_role, companies(name))")
    .eq("project_id", projectId);
  if (error) throw error;
  return data;
}

// 案件自体の削除（極めて破壊的な操作のためadmin限定）。DB側はON DELETE CASCADEで
// 関連テーブルが連鎖削除されるが、Storage上のファイルはFKの対象外のため別途削除する。
const DOCUMENTS_BUCKET = "project-documents";
const STORAGE_PAGE = 100;

// {prefix}配下のファイルをサブフォルダを含めてすべて列挙する（100件ずつページング）
async function listAllFiles(
  storage: ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>,
  prefix: string
): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await storage.list(prefix, { limit: STORAGE_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      // フォルダはidがnull
      if (entry.id === null) files.push(...(await listAllFiles(storage, `${prefix}/${entry.name}`)));
      else files.push(`${prefix}/${entry.name}`);
    }
    if (data.length < STORAGE_PAGE) break;
  }
  return files;
}

async function purgeProjectFiles(projectId: string) {
  const storage = createAdminClient().storage.from(DOCUMENTS_BUCKET);
  const paths = await listAllFiles(storage, projectId);
  for (let i = 0; i < paths.length; i += STORAGE_PAGE) {
    const { error } = await storage.remove(paths.slice(i, i + STORAGE_PAGE));
    if (error) throw error;
  }
  const remaining = await listAllFiles(storage, projectId);
  if (remaining.length > 0) throw new Error(`storage files remain: ${remaining.length}`);
}

export async function deleteProject(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") {
    throw new UserFacingError("この操作には管理者権限が必要です");
  }

  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();
  if (fetchError || !project) throw new UserFacingError("案件が見つかりません");

  const confirmName = formData.get("confirm_name") as string;
  if (confirmName !== project.name) {
    throw new UserFacingError("入力された案件名が一致しません");
  }

  // Storageの資料ファイルを先に、service-roleで確実に消す。利用者のクライアントで列挙すると、
  // StorageのSELECTポリシー（案件メンバーのみ）により、メンバーではない管理者には空に見える。
  // 削除と残存確認に成功してからDB行を消す。失敗時はDBを残し、再試行できる状態を保つ。
  try {
    await purgeProjectFiles(projectId);
  } catch (e) {
    console.error("deleteProject: storage purge failed", e);
    throw new UserFacingError("資料ファイルの削除に失敗したため、案件は削除されていません。時間をおいて再度お試しください");
  }

  const { error: deleteError } = await supabase.from("projects").delete().eq("id", projectId);
  if (deleteError) throw new UserFacingError(errorMessage(deleteError));

  revalidatePath("/projects");
  redirect("/projects");
}
