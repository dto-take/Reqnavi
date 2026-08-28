"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { diffFlowSteps } from "@/lib/business-flow/diff";
import { listFlowSteps } from "@/actions/business-flow";
import { listRequirementItems } from "@/actions/requirement-items";
import { CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";

export type OrphanItem = { id: string; chapterNo: number; name: string };

type ItemRow = { id: string; content: Record<string, string | null>; status: string };
type SourceRow = { item_id: string };

export async function checkOrphanItems(projectId: string, chapterNo?: number): Promise<OrphanItem[]> {
  const supabase = await createServerActionClient();
  const targetChapters = chapterNo ? [chapterNo] : Object.keys(CHAPTER_TEMPLATE_MAP).map(Number);

  const orphans: OrphanItem[] = [];
  for (const c of targetChapters) {
    const { data: itemsData, error } = await supabase
      .from("requirement_items")
      .select("id, content, status")
      .eq("project_id", projectId)
      .eq("chapter_no", c);
    if (error) throw error;
    // 不採用項目は孤立要件チェックの対象外（対応不要と判断済みのため）
    const items = (itemsData as unknown as ItemRow[] | null)?.filter((i) => i.status !== "rejected") ?? [];
    if (items.length === 0) continue;

    const { data: sourcesData } = await supabase
      .from("item_sources")
      .select("item_id")
      .in("item_id", items.map((i) => i.id));
    const sources = sourcesData as unknown as SourceRow[] | null;
    const itemIdsWithSource = new Set((sources ?? []).map((s) => s.item_id));

    for (const item of items) {
      if (!itemIdsWithSource.has(item.id)) {
        orphans.push({
          id: item.id,
          chapterNo: c,
          name: item.content?.name ?? item.content?.issue ?? item.content?.what ?? "(名称なし)",
        });
      }
    }
  }
  return orphans;
}

export async function checkUnreflectedSteps(projectId: string) {
  const [asisSteps, tobeSteps, functionalItems] = await Promise.all([
    listFlowSteps(projectId, "business_asis"),
    listFlowSteps(projectId, "business_tobe"),
    listRequirementItems(projectId, 9),
  ]);

  const { newSteps } = diffFlowSteps(asisSteps, tobeSteps);
  const existingNames = new Set(functionalItems.map((i) => (i.content.name ?? "").trim().toLowerCase()));

  return newSteps.filter((s) => !existingNames.has(s.label.trim().toLowerCase()));
}
