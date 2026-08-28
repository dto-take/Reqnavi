import { createServerActionClient } from "@/lib/supabase/server";
import { createPartnerAccount } from "@/actions/admin-users";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineErrorForm } from "@/components/ui/inline-error-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminPartnersPage() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") {
    redirect("/projects");
  }

  return (
    <Card className="max-w-md mx-auto mt-10">
      <PageHeader title="パートナーアカウント発行" />
      <InlineErrorForm action={createPartnerAccount} className="flex flex-col gap-3">
        <Input name="email" type="email" placeholder="メールアドレス" required />
        <Input name="temp_password" placeholder="仮パスワード（8文字以上、英数字混在）" required />
        <Input name="company_name" placeholder="協力会社名" required />
        <Button type="submit" variant="primary" size="md">発行</Button>
      </InlineErrorForm>
      <p className="text-xs text-secondary mt-3">
        発行後、仮パスワードは別途安全な手段でご本人に連絡してください。初回ログイン時にパスワード変更が強制されます。
      </p>
    </Card>
  );
}
