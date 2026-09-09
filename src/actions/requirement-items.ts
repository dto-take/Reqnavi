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

// 単票の「確定する」ボタンは!isItemLocked(status)の項目にしか表示されない（ロック済み
// ＝confirmed/exception_approved/rejectedは再確定できない）。一括確定は「全選択」やグループ
// 選択で選択集合にロック済み項目が紛れうるため、単票確定と矛盾しないようサーバー側でも
// 同じ条件（status in ai_draft/se_reviewing）に絞り込む（指示書Step3の注意書き対応）。
const UNLOCKED_STATUSES = ["ai_draft", "se_reviewing"];

export async function bulkConfirm(projectId: string, chapterNo: number, itemIds: string[]) {
  if (itemIds.length === 0) return;
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "confirmed" })
    .in("id", itemIds)
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .in("status", UNLOCKED_STATUSES);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function bulkReject(projectId: string, chapterNo: number, itemIds: string[]) {
  if (itemIds.length === 0) return;
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "rejected" })
    .in("id", itemIds)
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .in("status", UNLOCKED_STATUSES);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

// 選択項目のcontent.categoryを一括変更する。フェーズ2のmoveItemToGroupと違い対象が複数件の
// ため、jsonbのcontentは行ごとに異なる値を持ち、まとめて1回のUPDATEでは書けない
// （指示書Step3のコメント通り、対象行を取得してcontentを組み直し、個別UPDATEするループで
// 実装する）。並び替えは移動対象を対象グループの末尾にまとめて配置する形でorder_indexを
// 振り直す（フェーズ2のreorderGroupsと同じ「章全体を一旦グループ化してから並べ直す」考え方）。
// カテゴリ変更自体はフェーズ2のmoveItemToGroup（ドラッグでの単票移動）でもロック状態を
// 問わず行えるため、一括版でも同じくロック状態による制限は設けない（既存動作との整合）。
export async function bulkSetCategory(
  projectId: string,
  chapterNo: number,
  itemIds: string[],
  targetCategory: string
) {
  if (itemIds.length === 0) return;
  const supabase = await createServerActionClient();
  const all = await fetchOrderedItems(supabase, projectId, chapterNo);
  const idSet = new Set(itemIds);
  const normalizedCategory = targetCategory === UNCATEGORIZED_LABEL ? "" : targetCategory;

  for (const item of all) {
    if (!idSet.has(item.id)) continue;
    const { error } = await supabase
      .from("requirement_items")
      .update({ content: { ...item.content, category: normalizedCategory }, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) throw new UserFacingError(errorMessage(error));
  }

  const remaining = all.filter((i) => !idSet.has(i.id));
  const movedIds = all.filter((i) => idSet.has(i.id)).map((i) => i.id);
  const grouped = groupByCategory(remaining);

  const reordered: string[] = [];
  let inserted = false;
  for (const g of grouped) {
    reordered.push(...g.items.map((i) => i.id));
    if (g.category === targetCategory) {
      reordered.push(...movedIds);
      inserted = true;
    }
  }
  // targetCategoryが（新規入力等により）章内にまだ存在しないグループ名だった場合は末尾に追加
  if (!inserted) reordered.push(...movedIds);

  await applyOrder(supabase, reordered);
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
