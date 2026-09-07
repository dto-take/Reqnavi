import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listAllUsers, updateUserRole, createUserAccount } from "@/actions/user-management";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { InlineErrorForm } from "@/components/ui/inline-error-form";

const ROLES = ["admin", "exec", "pmo", "pm", "member", "partner"];

export default async function AdminUsersPage() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") redirect("/projects");

  const users = await listAllUsers();
  const currentUserId = claims?.claims?.sub as string | undefined;

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="mt-10">
        <PageHeader title="ユーザ管理" />
        <div className="flex flex-col gap-1">
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-4 items-center py-2 border-t border-hover text-sm">
              <span className="text-primary">{u.email}</span>
              <span className="text-xs text-secondary">{u.profile?.companies?.name ?? "-"}</span>
              <span className="text-xs text-faint">{u.profile?.auth_provider ?? "-"}</span>
              {u.id === currentUserId ? (
                <span className="text-xs text-faint">{u.profile?.user_role ?? "-"}（自分自身）</span>
              ) : (
                <form action={updateUserRole.bind(null, u.id)} className="flex gap-1 items-center">
                  <Select name="user_role" defaultValue={u.profile?.user_role ?? "member"}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <SubmitButton size="sm" pendingText="...">変更</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-primary mb-3">新規ユーザーを登録</h2>
        <InlineErrorForm action={createUserAccount} className="grid grid-cols-2 gap-2">
          <div>
            <Label>メールアドレス</Label>
            <Input name="email" type="email" required className="w-full" />
          </div>
          <div>
            <Label>仮パスワード</Label>
            <Input name="temp_password" required className="w-full" />
          </div>
          <div>
            <Label>ロール</Label>
            <Select name="user_role" required className="w-full">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <Label>所属会社</Label>
            <Input name="company_name" placeholder="既存の会社名、または新規会社名" required className="w-full" />
          </div>
          <SubmitButton pendingText="登録中..." className="col-span-2">登録</SubmitButton>
        </InlineErrorForm>
        <p className="text-xs text-faint mt-2">
          発行後、仮パスワードは別途安全な手段でご本人に連絡してください。初回ログイン時にパスワード変更が強制されます。
        </p>
      </Card>
    </div>
  );
}
