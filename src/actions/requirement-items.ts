"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
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
  const { data: items, error } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, template_type, content, status, ambiguous_flags, confidence, exception_reason")
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

  return (items as unknown as Omit<RequirementItem, "sources">[]).map((item) => ({
    ...item,
    sources: sourcesByItem.get(item.id) ?? [],
  }));
}

export async function reorderRequirementItems(
  projectId: string,
  chapterNo: number,
  orderedItemIds: string[]
) {
  const supabase = await createServerActionClient();

  // project_id・chapter_noの絞り込みは、orderedItemIdsに他章・他案件のIDが誤って
  // 紛れ込んでいた場合でも実害が生じないようにする防御的な条件（規約29と同種の考え方）
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await supabase
      .from("requirement_items")
      .update({ order_index: i })
      .eq("id", orderedItemIds[i])
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo);
    // 生のPostgrestエラー（Errorを継承しないプレーンオブジェクト）をそのままthrowすると、
    // onClick+startTransition側でtry/catchしても、Server Actionの境界を越える際に
    // フィールド値が"..."に置き換えられて中身が読めなくなる（実機で確認済み）。
    // 呼び出し元に届く前にerrorMessage()で実際の文言を取り出し、通常のErrorに包んでthrowする。
    if (error) throw new UserFacingError(errorMessage(error));
  }

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
