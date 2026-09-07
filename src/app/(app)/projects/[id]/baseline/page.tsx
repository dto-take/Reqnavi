import { getActiveBaseline, createBaseline } from "@/actions/baseline";
import { createServerActionClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default async function BaselinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const baseline = await getActiveBaseline(id);

  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const canApprove = ["admin", "pm"].includes(claims?.claims?.user_role as string);

  const readiness = (baseline?.readiness_snapshot as { chapterNo: number; readinessRate: number }[]) ?? [];
  const avgReadiness = readiness.length > 0
    ? Math.round(readiness.reduce((sum, r) => sum + r.readinessRate, 0) / readiness.length)
    : 0;

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <PageHeader title="ベースライン管理" />

      {baseline ? (
        <div className="mb-6 p-4 bg-sidebar rounded-md">
          <div className="text-sm font-medium text-primary">{baseline.version_no}（確定中）</div>
          <div className="text-xs text-secondary mt-1">確定日：{new Date(baseline.created_at).toLocaleDateString("ja-JP")}</div>
          <div className="text-xs text-secondary">平均充足率（確定時点）：{avgReadiness}%</div>
          {baseline.approval_note && <div className="text-xs text-secondary mt-1">メモ：{baseline.approval_note}</div>}
        </div>
      ) : (
        <p className="text-sm text-secondary mb-6">まだベースラインが確定されていません</p>
      )}

      {canApprove ? (
        <form action={createBaseline.bind(null, id)} className="flex flex-col gap-2">
          <Textarea name="approval_note" placeholder="確定メモ（任意）" rows={2} />
          <Button type="submit" variant="primary" size="md">
            {baseline ? "新しいベースラインとして再確定" : "ベースラインを確定"}
          </Button>
          <p className="text-[11px] text-faint">
            現在の充足率に関わらず確定できます。事前に確定判定ダッシュボード・整合性チェックの確認を推奨します。
          </p>
        </form>
      ) : (
        <p className="text-xs text-faint">ベースラインの確定にはPM以上の権限が必要です</p>
      )}
    </Card>
  );
}
