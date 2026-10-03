"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { pickBodyColumnKey } from "@/lib/requirement-body-field";
import { activityKind, type ActivityKind } from "@/lib/project-top/derive";

export type ActivityItem = {
  id: string;
  chapterNo: number;
  summary: string;
  kind: ActivityKind;
  at: string;
};
export type RecentDoc = { id: string; fileName: string; updatedAt: string };

export type ProjectTopData = {
  activity: ActivityItem[];
  recentDocuments: RecentDoc[];
  documentCount: number;
  memberCount: number;
  hasBaseline: boolean;
};

type ColumnRow = { template_type: string; column_key: string; order_index: number; applicable_chapters: number[] | null };

// 案件トップ用の補助データ。並列に1回ずつ取得する（案件・章・項目ごとの個別クエリにしない）。
// 「最近の動き」は操作ログを新設せず、項目の更新日時から導出する（不採用と、10章のチェック項目の行は除く）。
export async function getProjectTopData(projectId: string): Promise<ProjectTopData> {
  const supabase = await createServerActionClient();

  const [activityRes, columnsRes, docsRes, membersRes, baselineRes] = await Promise.all([
    supabase
      .from("requirement_items")
      .select("id, chapter_no, template_type, content, status, updated_at")
      .eq("project_id", projectId)
      .neq("status", "rejected")
      .or("chapter_no.neq.10,parent_id.is.null")
      .order("updated_at", { ascending: false })
      .order("id")
      .limit(8),
    supabase.from("chapter_column_templates").select("template_type, column_key, order_index, applicable_chapters").order("order_index"),
    supabase
      .from("source_documents")
      .select("id, file_name, updated_at", { count: "exact" })
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .order("id")
      .limit(5),
    supabase.from("project_members").select("user_id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("baseline_snapshots").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "active"),
  ]);
  if (activityRes.error) throw activityRes.error;

  // 本文列の選定は、RequirementCard・旧ナレッジ一覧と同じpickBodyColumnKeyに一本化する
  const columns = (columnsRes.data ?? []) as unknown as ColumnRow[];
  const bodyKeyFor = (templateType: string, chapterNo: number) =>
    pickBodyColumnKey(
      columns
        .filter((c) => c.template_type === templateType && (c.applicable_chapters === null || c.applicable_chapters.includes(chapterNo)))
        .map((c) => c.column_key)
    );

  const items = (activityRes.data ?? []) as unknown as {
    id: string;
    chapter_no: number;
    template_type: string;
    content: Record<string, string | null>;
    status: string;
    updated_at: string;
  }[];
  const activity = items.map((i) => {
    const key = bodyKeyFor(i.template_type, i.chapter_no);
    // 4章（KPI）・10章（観点）は列定義が無いため、text／nameから取る
    const summary = (key ? i.content?.[key] : null) || i.content?.text || i.content?.name || "(内容なし)";
    return { id: i.id, chapterNo: i.chapter_no, summary: String(summary), kind: activityKind(i.status), at: i.updated_at };
  });

  const docs = (docsRes.data ?? []) as unknown as { id: string; file_name: string; updated_at: string }[];
  return {
    activity,
    recentDocuments: docs.map((d) => ({ id: d.id, fileName: d.file_name, updatedAt: d.updated_at })),
    documentCount: docsRes.count ?? docs.length,
    memberCount: membersRes.count ?? 0,
    hasBaseline: (baselineRes.count ?? 0) > 0,
  };
}

// 最終更新者の表示名。必要なidをまとめて1回で取得する。
export async function getUserDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return {};
  const supabase = await createServerActionClient();
  const { data } = await supabase.from("user_profiles").select("user_id, display_name").in("user_id", ids);
  const names: Record<string, string> = {};
  for (const u of (data ?? []) as unknown as { user_id: string; display_name: string | null }[]) {
    if (u.display_name) names[u.user_id] = u.display_name;
  }
  return names;
}
