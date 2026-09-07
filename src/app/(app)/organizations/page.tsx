import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listOrganizationsWithProjectCount, createOrganization } from "@/actions/organizations";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function OrganizationsPage() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") redirect("/projects");

  const organizations = await listOrganizationsWithProjectCount();

  return (
    <div className="max-w-3xl mx-auto mt-10 flex flex-col gap-6">
      <Card>
        <PageHeader title="顧客管理" />
        <div className="flex flex-col gap-1">
          {organizations.map((org) => (
            <div key={org.id} className="flex justify-between items-center py-2 border-t border-hover text-sm">
              <span className="font-medium text-primary">{org.name}</span>
              <span className="text-xs text-secondary">{org.industry}</span>
              <span className="text-xs text-faint">{org.projects?.length ?? 0}件の案件</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-primary mb-3">新規顧客を追加</h2>
        <form action={createOrganization} className="flex gap-2">
          <div className="flex-1">
            <Label>顧客名</Label>
            <Input name="name" required className="w-full" />
          </div>
          <div className="flex-1">
            <Label>業種（任意）</Label>
            <Input name="industry" className="w-full" />
          </div>
          <SubmitButton pendingText="追加中...">追加</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
