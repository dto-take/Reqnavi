"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { isItemLocked } from "@/lib/item-lock";
import { revalidatePath } from "next/cache";

// nonfunctional_ux_phase1.md：観点（Aspect）・チェック項目（CheckItem）は、KPIツリーで
// 確立済みのparent_id/order_indexの親子階層パターンをそのまま流用する。観点＝parent_idが
// nullの行、チェック項目＝観点行をparent_idとする行。新しいテーブルはnonfunctional_aspect_master
// （観点マスタ）1つのみ追加し、「採用/未採用」は既存のstatus列のrejected（不採用）を流用する
// （未採用＝status:'rejected'。採用解除しても行を削除しないため方針・チェック項目が保持される）。

export type AspectMaster = {
  id: string;
  name: string;
  order_index: number;
  default_items: string[];
};

export type AspectContent = { name: string; policy: string; master_id: string | null };
export type CheckItemContent = { text: string; judgement: "yes" | "no" | "unknown"; source: "human" | "ai" | "master" };

export type NonfunctionalNode = {
  id: string;
  parent_id: string | null;
  content: AspectContent | CheckItemContent;
  status: string;
  order_index: number;
  updated_at: string;
  updatedByName: string | null;
};

export async function listAspectMaster(): Promise<AspectMaster[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("nonfunctional_aspect_master")
    .select("id, name, order_index, default_items")
    .order("order_index");
  if (error) throw error;
  return data as unknown as AspectMaster[];
}

// KPIツリー（listKpiTree）と同じ理由でcreated_atを第二キーにする（order_indexは
// 新規作成時に兄弟数をそのまま採番するのみで、並べ替え機能はフェーズ2の対象のため
// 同点になり得る）。
export async function listNonfunctionalNodes(projectId: string): Promise<NonfunctionalNode[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, parent_id, content, status, order_index, updated_at, user_profiles(display_name)")
    .eq("project_id", projectId)
    .eq("chapter_no", 10)
    .eq("template_type", "E")
    .order("order_index")
    .order("created_at");
  if (error) throw error;

  type RawNode = Omit<NonfunctionalNode, "updatedByName"> & {
    user_profiles: { display_name: string | null } | null;
  };
  return (data as unknown as RawNode[]).map(({ user_profiles, ...node }) => ({
    ...node,
    updatedByName: user_profiles?.display_name ?? null,
  }));
}

async function countAspects(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  projectId: string,
  excludeRejected: boolean
): Promise<number> {
  let query = supabase
    .from("requirement_items")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("chapter_no", 10)
    .eq("template_type", "E")
    .is("parent_id", null);
  if (excludeRejected) query = query.neq("status", "rejected");
  const { count, error } = await query;
  if (error) throw new UserFacingError(errorMessage(error));
  return count ?? 0;
}

// 未採用リストのうち「標準観点マスタ側からの採用」（Step3：その案件でまだ1件も行が
// 存在しないマスタ観点）。既存レコードが無いことが前提のため常に新規作成する。
export async function adoptMasterAspect(
  projectId: string,
  tenantId: string,
  masterId: string,
  name: string
): Promise<string> {
  const supabase = await createServerActionClient();
  const orderIndex = await countAspects(supabase, projectId, false);
  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 10,
      template_type: "E",
      parent_id: null,
      order_index: orderIndex,
      content: { name, policy: "", master_id: masterId } satisfies AspectContent,
      status: "se_reviewing",
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "作成に失敗しました");
  revalidatePath(`/projects/${projectId}/chapters/10`);
  return (data as unknown as { id: string }).id;
}

// 未採用リストのうち「rejectedの復活」（Step3：過去に採用解除された観点。標準観点由来・
// 独自観点のどちらも対象）。既存行のstatusを戻すだけで、方針・チェック項目はそのまま保持される。
export async function reactivateAspect(aspectId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "se_reviewing" })
    .eq("id", aspectId)
    .is("parent_id", null);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/10`);
}

// 独自の観点を作る。標準マスタには追加せず、案件固有のmaster_id:nullの観点行として作成する。
export async function createCustomAspect(projectId: string, tenantId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new UserFacingError("観点名を入力してください");
  const supabase = await createServerActionClient();
  const orderIndex = await countAspects(supabase, projectId, false);
  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 10,
      template_type: "E",
      parent_id: null,
      order_index: orderIndex,
      content: { name: trimmed, policy: "", master_id: null } satisfies AspectContent,
      status: "se_reviewing",
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "作成に失敗しました");
  revalidatePath(`/projects/${projectId}/chapters/10`);
  return (data as unknown as { id: string }).id;
}

// 採用解除＝未採用リストへ戻す。方針・チェック項目は削除しない（指示書の「やってはいけないこと」）。
// 採用中の観点が0件になる操作は不可（Interactions #3）。
export async function unadoptAspect(aspectId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const adoptedCount = await countAspects(supabase, projectId, true);
  if (adoptedCount <= 1) throw new UserFacingError("採用中の観点を0件にはできません。");
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "rejected" })
    .eq("id", aspectId)
    .is("parent_id", null);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/10`);
}

export async function updateAspectPolicy(aspectId: string, projectId: string, policy: string) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("content, status, parent_id")
    .eq("id", aspectId)
    .single();
  if (fetchError || !current) throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");
  if (current.parent_id !== null) throw new UserFacingError("観点以外の方針は編集できません");
  if (isItemLocked(current.status)) throw new UserFacingError("この観点は編集できません");

  const newContent = { ...(current.content as AspectContent), policy };
  const { error } = await supabase.from("requirement_items").update({ content: newContent }).eq("id", aspectId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/10`);
}

async function assertAspectEditable(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  aspectId: string
) {
  const { data: aspect, error } = await supabase
    .from("requirement_items")
    .select("status, parent_id")
    .eq("id", aspectId)
    .single();
  if (error || !aspect) throw new UserFacingError(error ? errorMessage(error) : "観点が見つかりません");
  if (aspect.parent_id !== null) throw new UserFacingError("追加先が不正です");
  if (isItemLocked(aspect.status)) throw new UserFacingError("この観点は編集できません");
}

export async function addCheckItem(
  aspectId: string,
  projectId: string,
  tenantId: string,
  text: string
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new UserFacingError("チェック項目の内容を入力してください");
  const supabase = await createServerActionClient();
  await assertAspectEditable(supabase, aspectId);

  const { count, error: countError } = await supabase
    .from("requirement_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", aspectId);
  if (countError) throw new UserFacingError(errorMessage(countError));

  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 10,
      template_type: "E",
      parent_id: aspectId,
      order_index: count ?? 0,
      content: { text: trimmed, judgement: "unknown", source: "human" } satisfies CheckItemContent,
      status: "se_reviewing",
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "追加に失敗しました");
  revalidatePath(`/projects/${projectId}/chapters/10`);
  return (data as unknown as { id: string }).id;
}

// Step4「標準項目から選ぶ」：観点マスタのdefault_itemsから複数選択で取り込む。
// 既存と重複する項目は呼び出し側（AspectDetailPane）で選択肢から除外する。
export async function importMasterCheckItems(
  aspectId: string,
  projectId: string,
  tenantId: string,
  texts: string[]
) {
  if (texts.length === 0) return;
  const supabase = await createServerActionClient();
  await assertAspectEditable(supabase, aspectId);

  const { count, error: countError } = await supabase
    .from("requirement_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", aspectId);
  if (countError) throw new UserFacingError(errorMessage(countError));
  const startIndex = count ?? 0;

  const rows = texts.map((text, i) => ({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 10,
    template_type: "E",
    parent_id: aspectId,
    order_index: startIndex + i,
    content: { text, judgement: "unknown", source: "master" } satisfies CheckItemContent,
    status: "se_reviewing",
  }));
  const { error } = await supabase.from("requirement_items").insert(rows);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/10`);
}

export async function setCheckItemJudgement(
  itemId: string,
  projectId: string,
  judgement: "yes" | "no" | "unknown"
) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("content, parent_id")
    .eq("id", itemId)
    .single();
  if (fetchError || !current || !current.parent_id) {
    throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");
  }
  await assertAspectEditable(supabase, current.parent_id);

  const newContent = { ...(current.content as CheckItemContent), judgement };
  const { error } = await supabase.from("requirement_items").update({ content: newContent }).eq("id", itemId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/10`);
}

export async function deleteCheckItem(itemId: string, projectId: string) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("parent_id")
    .eq("id", itemId)
    .single();
  if (fetchError || !current || !current.parent_id) {
    throw new UserFacingError(fetchError ? errorMessage(fetchError) : "項目が見つかりません");
  }
  await assertAspectEditable(supabase, current.parent_id);

  const { error } = await supabase.from("requirement_items").delete().eq("id", itemId);
  if (error) throw new UserFacingError(errorMessage(error));
  revalidatePath(`/projects/${projectId}/chapters/10`);
}
