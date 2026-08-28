"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function listProjects(organizationId?: string) {
  const supabase = await createServerActionClient();
  let query = supabase
    .from("projects")
    .select("id, name, selected_chapters, organizations(id, name)")
    .order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export type ProjectReadinessSummary = { total: number; confirmed: number };

// 案件一覧カードの簡易サマリー用。readiness機能（getReadinessSummary）は章ごとに
// 列定義まで見て詳細な要ヒアリング件数等を出すため一覧の全案件分を都度呼ぶには重く、
// ここでは確定率だけを見せたいので全案件分をまとめて1回のクエリで取得し、JS側で集計する
export async function listProjectsReadinessSummary(
  projectIds: string[]
): Promise<Record<string, ProjectReadinessSummary>> {
  if (projectIds.length === 0) return {};
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("project_id, status")
    .in("project_id", projectIds);
  if (error) throw error;

  const summary: Record<string, ProjectReadinessSummary> = {};
  for (const row of data as { project_id: string; status: string }[]) {
    const entry = summary[row.project_id] ?? { total: 0, confirmed: 0 };
    entry.total += 1;
    if (row.status === "confirmed" || row.status === "exception_approved") entry.confirmed += 1;
    summary[row.project_id] = entry;
  }
  return summary;
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
