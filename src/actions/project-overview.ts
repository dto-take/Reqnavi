"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getProjectProgress } from "@/actions/readiness";
import { listColumnDefs } from "@/actions/requirement-items";
import { pickBodyColumnKey } from "@/lib/requirement-body-field";

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

  // 確定判定ダッシュボード・サイドバーと同じ集計（list_project_chapter_stats）から得る
  const { rates: readiness, statuses: chapterStatusMap, avgReadiness } = await getProjectProgress(projectId);

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
    .select("chapter_no, template_type, content, status, updated_at")
    .eq("project_id", projectId)
    .in("status", ["confirmed", "exception_approved"])
    .order("updated_at", { ascending: false })
    .limit(6);
  if (error) throw error;

  const items = (data ?? []) as unknown as {
    chapter_no: number;
    template_type: string;
    content: Record<string, string | null>;
    status: string;
    updated_at: string;
  }[];

  // 本文列の選定はRequirementCardと同じpickBodyColumnKeyに一本化する（重複させない）。
  // テンプレートごとに列一覧が異なるため、項目ごとにlistColumnDefsで該当章の列を取得する。
  return Promise.all(
    items.map(async (item) => {
      const columns = await listColumnDefs(item.template_type, item.chapter_no);
      const bodyKey = pickBodyColumnKey(columns.map((c) => c.column_key));
      const summary = (bodyKey ? item.content?.[bodyKey] : null) ?? "(内容なし)";
      return {
        chapterNo: item.chapter_no,
        summary,
        status: item.status,
        updatedAt: item.updated_at,
      };
    })
  );
}
