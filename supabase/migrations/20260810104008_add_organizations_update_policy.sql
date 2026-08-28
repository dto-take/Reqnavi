-- organizationsには既存のUPDATE GRANTが無かった（select/insertのみ。規約12）ため、ここで追加する。
grant update on organizations to authenticated;

create policy "organizations_update" on organizations
  for update using ((auth.jwt() ->> 'user_role') in ('admin', 'pm'));

-- ユーザ管理（admin限定）でuser_profiles.user_roleを変更できるようにする。
-- 既存のuser_profiles_update_self（本人のみ）はauth.uid() = user_idを要求するため、
-- 管理者が他ユーザーの行を更新する経路が無かった（規約16）。
-- user_roleカラムのみに限定したGRANT（規約32と同じ考え方。テーブル全体のUPDATE権限は渡さない）。
grant update (user_role) on user_profiles to authenticated;

create policy "user_profiles_update_role_by_admin" on user_profiles
  for update using ((auth.jwt() ->> 'user_role') = 'admin')
  with check ((auth.jwt() ->> 'user_role') = 'admin');
