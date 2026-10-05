-- 案件メンバーの削除（案件のメンバーであるadmin・pmのみ。メンバー追加＝project_members_insertと同じ条件）。
-- project_membersにはDELETEポリシーが無かった。
create policy project_members_delete on public.project_members
  for delete
  using (
    (auth.jwt() ->> 'user_role') in ('admin', 'pm')
    and public.is_project_member(project_id)
  );

-- authenticatedにはproject_membersのDELETE権限（GRANT）が無かったため、ポリシーだけでは
-- 「permission denied」になる。ポリシー（上記）が許す範囲に絞って付与する。
grant delete on public.project_members to authenticated;
