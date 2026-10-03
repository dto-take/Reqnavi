"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchAllPages } from "@/lib/paged-select";
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
    summary: summarizeProject(p.selected_chapters ?? [], statsByProject.get(p.id) ?? []),
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
    redirect(`/projects/new?error=${encodeURIComponent(error.message)}`);
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

  // storage.list()は1回あたり最大100件までしか返さない。現状の運用規模（1案件あたりの
  // 資料数）ではまず問題にならない想定だが、将来的に100件を超える案件が出てきた場合は
  // offsetを使ったページネーションが必要になる。
  const { data: files } = await supabase.storage
    .from("project-documents")
    .list(`${projectId}/uploads`, { limit: 1000 });
  if (files && files.length > 0) {
    const paths = files.map((f) => `${projectId}/uploads/${f.name}`);
    await supabase.storage.from("project-documents").remove(paths);
  }

  const { error: deleteError } = await supabase.from("projects").delete().eq("id", projectId);
  if (deleteError) throw new UserFacingError(errorMessage(deleteError));

  revalidatePath("/projects");
  redirect("/projects");
}
