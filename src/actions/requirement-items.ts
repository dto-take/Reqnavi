"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { groupByCategory, UNCATEGORIZED_LABEL } from "@/lib/requirement-grouping";
import { revalidatePath } from "next/cache";
import type { AmbiguousFlag } from "@/lib/ambiguous-phrases";

export type ColumnDef = {
  column_key: string;
  label: string;
  data_type: string;
  order_index: number;
  applicable_chapters: number[] | null;
  width_hint: "normal" | "wide";
};

export type RequirementItem = {
  id: string;
  chapter_no: number;
  template_type: string;
  content: Record<string, string>;
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved" | "rejected";
  ambiguous_flags: AmbiguousFlag[];
  confidence: "explicit" | "inferred" | null;
  exception_reason: string | null;
  sources: { fileName: string; locationNote: string | null }[];
  updatedAt: string;
  updatedByName: string | null;
};

export async function listColumnDefs(templateType: string, chapterNo: number): Promise<ColumnDef[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("chapter_column_templates")
    .select("column_key, label, data_type, order_index, applicable_chapters, width_hint")
    .eq("template_type", templateType)
    .order("order_index");
  if (error) throw error;

  // applicable_chaptersがnull（全章共通）、またはこの章番号を含む場合のみ残す
  return ((data as unknown as ColumnDef[]) ?? []).filter(
    (c) => c.applicable_chapters === null || c.applicable_chapters.includes(chapterNo)
  );
}

export async function listRequirementItems(
  projectId: string,
  chapterNo: number
): Promise<RequirementItem[]> {
  const supabase = await createServerActionClient();
  // order_indexは並び替え機能が一度も使われていない項目は全件0のままなので、created_atを
  // 第二キーにして並び替え前の初期表示順を安定させる
  // user_profiles(display_name)の埋め込みJOINは、requirement_items.updated_byが
  // user_profiles(user_id)を直接参照しているため解決できる（auth.usersへのFKでは
  // PostgRESTが関係を解決できない。規約14）。
  const { data: items, error } = await supabase
    .from("requirement_items")
    .select(
      "id, chapter_no, template_type, content, status, ambiguous_flags, confidence, exception_reason, updated_at, user_profiles(display_name)"
    )
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .order("order_index")
    .order("created_at");
  if (error) throw error;
  if (!items || items.length === 0) return [];

  const { data: sourceLinks } = await supabase
    .from("item_sources")
    .select("item_id, location_note, source_documents(file_name)")
    .in("item_id", items.map((i) => i.id));

  const sourcesByItem = new Map<string, { fileName: string; locationNote: string | null }[]>();
  for (const link of sourceLinks ?? []) {
    const fileName = (link.source_documents as unknown as { file_name: string })?.file_name ?? "(不明)";
    const existing = sourcesByItem.get(link.item_id) ?? [];
    existing.push({ fileName, locationNote: link.location_note });
    sourcesByItem.set(link.item_id, existing);
  }

  type RawItem = Omit<RequirementItem, "sources" | "updatedByName" | "updatedAt"> & {
    updated_at: string;
    user_profiles: { display_name: string | null } | null;
  };
  return (items as unknown as RawItem[]).map(({ user_profiles, updated_at, ...item }) => ({
    ...item,
    updatedAt: updated_at,
    updatedByName: user_profiles?.display_name ?? null,
    sources: sourcesByItem.get(item.id) ?? [],
  }));
}

type OrderRow = { id: string; content: Record<string, string>; order_index: number };

// 章内の全項目をorder_index順（規約42のタイブレーカー込み）で取得する。
// moveItemToGroup・reorderGroupsで共通して使う（指示書Step2の「共有ヘルパーに切り出す」提案）。
async function fetchOrderedItems(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  projectId: string,
  chapterNo: number
): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, content, order_index")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .order("order_index")
    .order("created_at");
  if (error) throw new UserFacingError(errorMessage(error));
  return (data as unknown as OrderRow[]) ?? [];
}

async function applyOrder(supabase: Awaited<ReturnType<typeof createServerActionClient>>, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("requirement_items").update({ order_index: i }).eq("id", orderedIds[i]);
    // 生のPostgrestエラーをそのままthrowすると、onClick+startTransition側でtry/catchしても
    // Server Actionの境界を越える際にフィールド値が読めなくなる（規約43）。
    if (error) throw new UserFacingError(errorMessage(error));
  }
}

// カードのドラッグ&ドロップ（同一グループ内の並び替え・別グループへの移動の両方）。
// 章内の全項目をorder_index順で取得し、itemIdを一旦除外した配列に対して
// insertBeforeItemIdの直前（nullや見つからない場合は末尾）にitemIdを挿入し直し、
// 配列全体のorder_indexを0から振り直す。同時にitemIdのcontent.categoryを更新する。
// targetCategoryがUNCATEGORIZED_LABEL（「未分類」プレースホルダ）の場合は空文字として保存する
// （実データに「未分類」という文字列自体を書き込まないようにするため）。
export async function moveItemToGroup(
  projectId: string,
  chapterNo: number,
  itemId: string,
  targetCategory: string,
  insertBeforeItemId: string | null
) {
  const supabase = await createServerActionClient();
  const all = await fetchOrderedItems(supabase, projectId, chapterNo);

  const target = all.find((i) => i.id === itemId);
  if (!target) throw new UserFacingError("対象の項目が見つかりません");

  const normalizedCategory = targetCategory === UNCATEGORIZED_LABEL ? "" : targetCategory;
  const nextContent = { ...target.content, category: normalizedCategory };

  const { error: contentError } = await supabase
    .from("requirement_items")
    .update({ content: nextContent, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (contentError) throw new UserFacingError(errorMessage(contentError));

  const withoutItem = all.filter((i) => i.id !== itemId).map((i) => i.id);
  const insertAt = insertBeforeItemId ? withoutItem.indexOf(insertBeforeItemId) : -1;
  const at = insertAt === -1 ? withoutItem.length : insertAt;
  const reordered = [...withoutItem];
  reordered.splice(at, 0, itemId);

  await applyOrder(supabase, reordered);
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

// グループ見出し自体の並び替え。既存のグループ内相対順序は維持したまま、
// orderedCategoriesの順にグループを並べ直し、章全体のorder_indexを0から振り直す。
export async function reorderGroups(projectId: string, chapterNo: number, orderedCategories: string[]) {
  const supabase = await createServerActionClient();
  const all = await fetchOrderedItems(supabase, projectId, chapterNo);
  const grouped = groupByCategory(all);

  const itemsByCategory = new Map(grouped.map((g) => [g.category, g.items]));
  const reordered: OrderRow[] = [];
  for (const category of orderedCategories) {
    const items = itemsByCategory.get(category);
    if (items) reordered.push(...items);
  }
  // orderedCategoriesに含まれていないカテゴリ（想定外の欠落）があれば末尾に残し、
  // 項目を静かに失わないようにする防御的な処理
  for (const g of grouped) {
    if (!orderedCategories.includes(g.category)) reordered.push(...g.items);
  }

  await applyOrder(supabase, reordered.map((i) => i.id));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function createRequirementItem(
  projectId: string,
  tenantId: string,
  chapterNo: number,
  templateType: string
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("requirement_items").insert({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: chapterNo,
    template_type: templateType,
    content: {},
    status: "se_reviewing", // 手動追加した行はSE入力扱いとする
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function updateRequirementItemContent(
  itemId: string,
  projectId: string,
  chapterNo: number,
  content: Record<string, string>
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function markAsExceptionApproved(
  itemId: string,
  projectId: string,
  chapterNo: number,
  reason: string
) {
  const supabase = await createServerActionClient();
  if (!reason.trim()) throw new UserFacingError("理由の入力が必須です");

  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "exception_approved", exception_reason: reason })
    .eq("id", itemId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function markAsRejected(itemId: string, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "rejected" })
    .eq("id", itemId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function deleteRequirementItem(itemId: string, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function updateRequirementItemStatus(
  itemId: string,
  projectId: string,
  chapterNo: number,
  status: RequirementItem["status"]
) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status })
    .eq("id", itemId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
