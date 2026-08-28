import Link from "next/link";
import { createServerActionClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import { LogoMark } from "@/components/ui/logo-mark";
import { RoleBadge, type Role } from "@/components/ui/role-badge";
import { Button } from "@/components/ui/button";

export async function AppHeader() {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const email = claims?.claims?.email as string | undefined;
  const userRole = claims?.claims?.user_role as Role | undefined;

  return (
    <header className="h-14 border-b border-border bg-page flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-6">
        <Link href="/projects" className="flex items-center gap-2">
          <LogoMark className="w-6 h-6" />
          <span className="text-sm font-semibold text-primary">ReqNavi</span>
        </Link>
        {userRole === "admin" && (
          <nav className="flex gap-4">
            <Link href="/organizations" className="text-sm text-secondary hover:text-primary">顧客管理</Link>
            <Link href="/admin/users" className="text-sm text-secondary hover:text-primary">ユーザ管理</Link>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        {email && <span className="text-xs text-secondary">{email}</span>}
        {userRole && <RoleBadge role={userRole} />}
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">ログアウト</Button>
        </form>
      </div>
    </header>
  );
}
