"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getReadinessSummary, getSimpleChapterStatuses } from "@/actions/readiness";
import { chapterStatusFromReadiness, type ChapterStatus } from "@/lib/chapter-status";

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

  const { count: openChangeCount } = await supabase
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "open");

  const readiness = await getReadinessSummary(projectId);
  const avgReadiness = readiness.length > 0
    ? Math.round(readiness.reduce((sum, r) => sum + r.readinessRate, 0) / readiness.length)
    : 0;

  const simpleStatuses = await getSimpleChapterStatuses(projectId);
  const chapterStatusMap: Record<number, ChapterStatus> = {};
  for (const r of readiness) {
    chapterStatusMap[r.chapterNo] = chapterStatusFromReadiness(r);
  }
  for (const [chapterNo, status] of Object.entries(simpleStatuses)) {
    chapterStatusMap[Number(chapterNo)] = status;
  }

  return {
    project,
    documentCount: documentCount ?? 0,
    memberCount: memberCount ?? 0,
    baseline,
    openChangeCount: openChangeCount ?? 0,
    avgReadiness,
    readiness,
    chapterStatusMap,
  };
}

export type KnowledgeItem = {
  chapterNo: number;
  summary: string;
  status: string;
  updatedAt: string;
};

export async function getRecentKnowledge(projectId: string): Promise<KnowledgeItem[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("chapter_no, content, status, updated_at")
    .eq("project_id", projectId)
    .in("status", ["confirmed", "exception_approved"])
    .order("updated_at", { ascending: false })
    .limit(6);
  if (error) throw error;

  return ((data ?? []) as unknown as { chapter_no: number; content: Record<string, string | null>; status: string; updated_at: string }[]).map((item) => ({
    chapterNo: item.chapter_no,
    summary: item.content?.name ?? item.content?.detail ?? item.content?.issue ?? item.content?.why ?? "(内容なし)",
    status: item.status,
    updatedAt: item.updated_at,
  }));
}
