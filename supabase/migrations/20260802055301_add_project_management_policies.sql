-- project_membersの自己参照ポリシーがそのままだと評価時に自分自身のRLSを再度評価し
-- 無限再帰（42P17）になるため、security definerな判定関数でRLSを迂回して所属チェックする。
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;

-- organizations（顧客企業）：認証済みユーザーは閲覧可、作成はadmin/pmのみ
create policy "organizations_select" on organizations
  for select using (auth.uid() is not null);

create policy "organizations_insert" on organizations
  for insert with check ((auth.jwt() ->> 'user_role') in ('admin','pm'));

-- companies（自社/パートナー会社）：認証済みユーザーは閲覧可、作成はadminのみ
create policy "companies_select" on companies
  for select using (auth.uid() is not null);

create policy "companies_insert" on companies
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

-- projects：自分がメンバーの案件、またはadmin/exec/pmoは全件閲覧可
create policy "projects_select" on projects
  for select using (
    is_project_member(id)
    or (auth.jwt() ->> 'user_role') in ('admin','exec','pmo')
  );

create policy "projects_insert" on projects
  for insert with check ((auth.jwt() ->> 'user_role') in ('admin','pm'));

-- project_members：自分が参加する案件のメンバー一覧、またはadmin/exec/pmoは全件閲覧可
create policy "project_members_select" on project_members
  for select using (
    is_project_member(project_id)
    or (auth.jwt() ->> 'user_role') in ('admin','exec','pmo')
  );

create policy "project_members_insert" on project_members
  for insert with check ((auth.jwt() ->> 'user_role') in ('admin','pm'));

-- 案件の対象章選択を保持する列
alter table projects add column if not exists selected_chapters int[] not null default '{}';

-- project_members.user_idはauth.users(id)のみを参照しており、PostgRESTがuser_profilesへの
-- 自動埋め込み（select("user_profiles(...)")）に必要な直接のFKを検出できないため追加する。
-- （project_membersに載る時点でJWTのuser_roleクレームが必要＝user_profiles行の存在が前提のため安全）
alter table project_members
  add constraint project_members_user_id_fkey_profiles
  foreign key (user_id) references user_profiles(user_id);

-- CLIマイグレーションで作成したテーブルにはSupabase Studio経由と異なりanon/authenticatedへの
-- 基本権限が自動付与されないため、RLSポリシーとは別に明示的にGRANTする（RLSは行を絞るだけで
-- テーブル自体へのアクセス権の代わりにはならない）。
grant select, insert on organizations, companies, projects, project_members to authenticated;

-- user_profilesも同様にauthenticatedへのSELECT権限が付与されていなかったため追加する。
grant select on user_profiles to authenticated;

-- メンバー管理画面では同じ案件のメンバーのプロフィール（表示名・ロール）を閲覧する必要があるが、
-- 既存のown_profile_readは本人分しか許可しないため、同一案件メンバー間の閲覧を追加で許可する
-- （permissiveポリシーなのでown_profile_readとはOR条件で共存する）。
create policy "project_co_member_profile_read" on user_profiles
  for select using (
    exists (
      select 1 from project_members mine
      join project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = auth.uid()
        and theirs.user_id = user_profiles.user_id
    )
    or (auth.jwt() ->> 'user_role') in ('admin','exec','pmo')
  );
