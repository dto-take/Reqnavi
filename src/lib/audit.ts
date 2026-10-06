import "server-only";
import { createServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 監査ログ（audit_logs）への記録。サーバー専用（ブラウザに送るコードからはimportできない）。
// 書き込みはservice_roleのクライアントだけが行う（利用者のJWTからはinsertできない）。
// 実行者は、セッションからここで取得する（引数で受け取らない）。案件・対象は、呼び出し元が処理の中で
// 確定した値を渡す（クライアントの引数をそのまま渡さない）。資料の内容・項目の本文は記録しない（メタデータのみ）。

export type AuditAction = "document.delete" | "member.remove" | "project.delete" | "baseline.confirm";

export type AuditProject = { id: string; name: string | null; customerName: string | null };

type Supabase = Awaited<ReturnType<typeof createServerActionClient>>;

// 案件のスナップショット（案件名・顧客名）。案件の削除では、削除する前に取っておく（削除後には取れない）。
// 取得に失敗しても操作は止めず、名前は空にする（記録の都合で、操作を失敗させない）。
export async function loadAuditProject(supabase: Supabase, projectId: string): Promise<AuditProject> {
  try {
    const { data } = await supabase
      .from("projects")
      .select("name, organizations(name)")
      .eq("id", projectId)
      .maybeSingle();
    const row = data as unknown as { name: string; organizations: { name: string } | null } | null;
    return { id: projectId, name: row?.name ?? null, customerName: row?.organizations?.name ?? null };
  } catch (e) {
    console.error("[audit] 案件のスナップショットの取得に失敗:", e);
    return { id: projectId, name: null, customerName: null };
  }
}

export type AuditInput = {
  action: AuditAction;
  project: AuditProject;
  target: { type: "document" | "member" | "project" | "baseline"; id: string | null; label: string | null };
  details: Record<string, string | number | boolean | null>;
};

// 操作が成功を確定した直後に呼ぶ。失敗しても例外は投げず、記録しようとした内容ごとconsole.errorに出す
// （完了した操作を失敗扱いにせず、かつ、ログを残せなかったことを黙って捨てない）。
export async function recordAudit(input: AuditInput): Promise<void> {
  let row: Record<string, unknown> = { ...input };
  try {
    const supabase = await createServerActionClient();
    const { data: claims } = await supabase.auth.getClaims();
    const actorId = (claims?.claims?.sub as string | undefined) ?? null;
    const actorRole = (claims?.claims?.user_role as string | undefined) ?? null;
    const tenantId = claims?.claims?.tenant_id as string | undefined;
    const email = (claims?.claims?.email as string | undefined) ?? null;

    let displayName: string | null = null;
    if (actorId) {
      const { data } = await supabase.from("user_profiles").select("display_name").eq("user_id", actorId).maybeSingle();
      displayName = (data as unknown as { display_name: string | null } | null)?.display_name ?? null;
    }

    row = {
      tenant_id: tenantId,
      actor_id: actorId,
      actor_name: displayName ?? email,
      actor_role: actorRole,
      action: input.action,
      project_id: input.project.id,
      project_name: input.project.name,
      customer_name: input.project.customerName,
      target_type: input.target.type,
      target_id: input.target.id,
      target_label: input.target.label,
      details: input.details,
    };
    if (!tenantId) throw new Error("tenant_idを取得できません");

    const { error } = await createAdminClient().from("audit_logs").insert(row);
    if (error) throw error;
  } catch (e) {
    console.error("[audit] 監査ログの記録に失敗しました。記録しようとした内容:", JSON.stringify(row), "原因:", e instanceof Error ? e.message : JSON.stringify(e));
  }
}
