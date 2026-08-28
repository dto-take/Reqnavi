import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listAllUsers, updateUserRole } from "@/actions/user-management";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

const ROLES = ["admin", "exec", "pmo", "pm", "member", "partner"];

export default async function AdminUsersPage() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") redirect("/projects");

  const users = await listAllUsers();
  const currentUserId = claims?.claims?.sub as string | undefined;

  return (
    <Card className="max-w-3xl mx-auto mt-10">
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
  );
}
