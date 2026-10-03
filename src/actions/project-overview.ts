"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getProjectProgress } from "@/actions/readiness";

type ProjectOverviewProject = {
  name: string;
  selected_chapters: number[];
  organizations: { name: string } | null;
};

export async function getProjectOverview(projectId: string) {
  const supabase = await createServerActionClient();

  const { data: projectData } = await supabase
    .from("projects")
    .select("name, selected_chapters, organizations(name)")
    .eq("id", projectId)
    .single();
  const project = projectData as unknown as ProjectOverviewProject | null;

  const { count: documentCount } = await supabase
    .from("source_documents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { count: memberCount } = await supabase
    .from("project_members")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data: baseline } = await supabase
    .from("baseline_snapshots")
    .select("version_no, created_at")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();

  // 確定判定ダッシュボード・サイドバーと同じ集計（list_project_chapter_stats）から得る
  const { rates: readiness, statuses: chapterStatusMap, overall } = await getProjectProgress(projectId);

  return {
    project,
    documentCount: documentCount ?? 0,
    memberCount: memberCount ?? 0,
    baseline,
    overall,
    readiness,
    chapterStatusMap,
  };
}
