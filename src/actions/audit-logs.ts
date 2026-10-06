"use server";

import { safeAction, type ActionResult } from "@/lib/action-result";
import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";

// 監査ログの閲覧（adminのみ。RLSも、同じテナントのadminだけに見せる）。
// 一覧は50件ずつ取得する（テナントの全件を一度に取らない）。

const AUDIT_PAGE_SIZE = 50;

export type AuditLogRow = {
  id: string;
  occurred_at: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  project_name: string | null;
  customer_name: string | null;
  target_type: string | null;
  target_label: string | null;
  details: Record<string, unknown>;
};

export type AuditLogFilter = { action: string | null; project: string };
export type AuditLogPage = { rows: AuditLogRow[]; hasMore: boolean };

const AUDIT_ACTIONS = ["document.delete", "member.remove", "project.delete", "baseline.confirm"];
const COLUMNS = "id, occurred_at, actor_name, actor_role, action, project_name, customer_name, target_type, target_label, details";

export async function listAuditLogs(filter: AuditLogFilter, offset: number): Promise<ActionResult<AuditLogPage>> {
  return safeAction("listAuditLogs", () => listAuditLogsInner(filter, offset));
}

async function listAuditLogsInner(filter: AuditLogFilter, offset: number): Promise<AuditLogPage> {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") throw new UserFacingError("この操作には管理者権限が必要です");
  if (!Number.isInteger(offset) || offset < 0) throw new UserFacingError("指定が正しくありません");
  if (filter.action && !AUDIT_ACTIONS.includes(filter.action)) throw new UserFacingError("指定が正しくありません");

  let query = supabase.from("audit_logs").select(COLUMNS);
  if (filter.action) query = query.eq("action", filter.action);
  const keyword = filter.project.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  if (keyword) query = query.ilike("project_name", `%${keyword}%`);
  // 新しい順（同時刻はidで安定させる）。次のページがあるかを知るため、1件多く取る
  const { data, error } = await query
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE);
  if (error) throw new UserFacingError(errorMessage(error));
  const rows = (data ?? []) as unknown as AuditLogRow[];
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}
