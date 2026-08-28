"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

export type ItemDiff = {
  itemId: string;
  chapterNo: number;
  changeType: "added" | "modified" | "deleted";
  beforeContent: Record<string, string> | null;
  afterContent: Record<string, string> | null;
};

type SnapshotRow = { item_id: string; chapter_no: number; content: Record<string, string> };
type CurrentItemRow = { id: string; chapter_no: number; content: Record<string, string> };

export type ChangeRequestRow = {
  id: string;
  // 削除された項目に紐づく変更申請はitem_idがnullになる（change_requests_item_id_fkeyが
  // ON DELETE SET NULLのため。行自体は業務記録として残る）
  item_id: string | null;
  chapter_no: number;
  change_type: string;
  reason: string;
  estimation_impact: string | null;
  status: string;
  raised_at: string;
};

export async function getDiffFromBaseline(projectId: string): Promise<ItemDiff[]> {
  const supabase = await createServerActionClient();

  const { data: baselineData } = await supabase
    .from("baseline_snapshots")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  const baseline = baselineData as unknown as { id: string } | null;
  if (!baseline) return [];

  const { data: snapshotsData, error: snapError } = await supabase
    .from("baseline_item_snapshots")
    .select("item_id, chapter_no, content")
    .eq("baseline_id", baseline.id);
  if (snapError) throw snapError;
  const snapshots = snapshotsData as unknown as SnapshotRow[];

  const { data: currentItemsData, error: curError } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, content")
    .eq("project_id", projectId);
  if (curError) throw curError;
  const currentItems = currentItemsData as unknown as CurrentItemRow[];

  const snapshotMap = new Map((snapshots ?? []).map((s) => [s.item_id, s]));
  const currentMap = new Map((currentItems ?? []).map((i) => [i.id, i]));

  const diffs: ItemDiff[] = [];

  for (const [itemId, current] of currentMap) {
    const snapshot = snapshotMap.get(itemId);
    if (!snapshot) {
      diffs.push({ itemId, chapterNo: current.chapter_no, changeType: "added", beforeContent: null, afterContent: current.content });
    } else if (JSON.stringify(snapshot.content) !== JSON.stringify(current.content)) {
      diffs.push({ itemId, chapterNo: current.chapter_no, changeType: "modified", beforeContent: snapshot.content, afterContent: current.content });
    }
  }

  for (const [itemId, snapshot] of snapshotMap) {
    if (!currentMap.has(itemId)) {
      diffs.push({ itemId, chapterNo: snapshot.chapter_no, changeType: "deleted", beforeContent: snapshot.content, afterContent: null });
    }
  }

  return diffs;
}

export async function raiseChangeRequest(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new UserFacingError("認証が必要です");

  const { data: baselineData } = await supabase
    .from("baseline_snapshots")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  const baseline = baselineData as unknown as { id: string } | null;

  const itemId = formData.get("item_id") as string;
  const chapterNo = Number(formData.get("chapter_no"));
  const changeType = formData.get("change_type") as string;
  const beforeContent = formData.get("before_content") as string;
  const afterContent = formData.get("after_content") as string;
  const reason = formData.get("reason") as string;
  const estimationImpact = formData.get("estimation_impact") as string;

  if (!reason.trim()) throw new UserFacingError("変更理由の入力が必須です");

  const { error } = await supabase.from("change_requests").insert({
    project_id: projectId,
    tenant_id: tenantId,
    baseline_id: baseline?.id ?? null,
    item_id: itemId,
    chapter_no: chapterNo,
    change_type: changeType,
    before_content: beforeContent ? JSON.parse(beforeContent) : null,
    after_content: afterContent ? JSON.parse(afterContent) : null,
    reason,
    estimation_impact: estimationImpact || null,
    raised_by: userData.user.id,
    status: "open",
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/changes`);
}

export async function listChangeRequests(projectId: string): Promise<ChangeRequestRow[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("change_requests")
    .select("id, item_id, chapter_no, change_type, reason, estimation_impact, status, raised_at")
    .eq("project_id", projectId)
    .order("raised_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as ChangeRequestRow[];

  // estimation_impactはパートナーには不可視（RLSは行単位のためここで列マスキングする。
  // Phase3 Step5の実機検証で判明：行単位のRLSではこの列が入っている行自体が丸ごと
  // 見えなくなってしまい、reason等の他フィールドも消えてしまうため）
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role === "partner") {
    return rows.map((r) => ({ ...r, estimation_impact: null }));
  }
  return rows;
}
