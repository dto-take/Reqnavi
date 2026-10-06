import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listAuditLogs } from "@/actions/audit-logs";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AuditLogList } from "@/components/domain/audit-log-list";

export default async function AuditLogsPage() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") redirect("/projects");

  const first = await listAuditLogs({ action: null, project: "" }, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <Card className="mt-10">
        <PageHeader title="監査ログ" />
        <p className="text-xs text-faint mb-3">
          資料の削除・案件メンバーの削除・案件の削除・ベースラインの確定を、誰が・いつ・どの案件に行ったかの記録です。記録は変更・削除できません。
        </p>
        {first.ok ? (
          <AuditLogList initial={first.data} />
        ) : (
          <p role="alert" className="text-sm text-[#A23B2E]">{first.error}</p>
        )}
      </Card>
    </div>
  );
}
