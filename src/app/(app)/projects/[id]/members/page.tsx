import { getProjectDetail, listProjectMembers } from "@/actions/projects";
import { addProjectMemberByEmail } from "@/actions/admin-users";
import { RoleBadge, type Role } from "@/components/ui/role-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ProjectDetail = {
  id: string;
  name: string;
  selected_chapters: number[];
  organizations: { name: string } | null;
};

type ProjectMember = {
  user_id: string;
  user_profiles: {
    display_name: string | null;
    user_role: Role;
    companies: { name: string } | null;
  } | null;
};

export default async function ProjectMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = (await getProjectDetail(id)) as unknown as ProjectDetail;
  const members = (await listProjectMembers(id)) as unknown as ProjectMember[] | null;

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <div className="mb-4">
        <p className="text-[11px] text-faint">{project.organizations?.name}</p>
        <h1 className="text-base font-semibold text-primary">{project.name}</h1>
      </div>

      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-faint">{members?.length ?? 0}名</span>
        <form action={addProjectMemberByEmail.bind(null, id)} className="flex gap-2">
          <Input name="email" type="email" placeholder="メールアドレス" required />
          <Button type="submit" variant="secondary" size="md">追加</Button>
        </form>
      </div>

      <div className="flex flex-col">
        {members?.map((m) => (
          <div key={m.user_id} className="grid grid-cols-3 items-center py-2 border-t border-hover text-sm">
            <span>{m.user_profiles?.display_name ?? "(未設定)"}</span>
            <span className="text-secondary text-xs">{m.user_profiles?.companies?.name}</span>
            <RoleBadge role={m.user_profiles?.user_role ?? "member"} />
          </div>
        ))}
      </div>

      <div className="mt-3.5 p-2.5 bg-sidebar rounded-md text-[11px] text-faint">
        partnerロールのメンバーは、コスト関連項目・組織横断ダッシュボードを閲覧できません
      </div>
    </Card>
  );
}
