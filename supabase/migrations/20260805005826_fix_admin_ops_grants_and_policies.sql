-- 1. service_roleにはCLIマイグレーションで作成したテーブルへのGRANTが自動付与されない
--    （authenticated同様の問題。Phase2 Step6の実機検証で発覚した現象と同種）。
--    createAdminClient()（管理者操作専用）がcompanies/user_profilesを直接操作するため、
--    service_roleに対して明示的にGRANTする。project_members分はcreateProjectの
--    初回メンバー登録（下記2.のRLS強化に伴いservice_role経由に変更）で必要。
grant select, insert, update, delete on companies to service_role;
grant select, insert, update, delete on user_profiles to service_role;
grant select, insert, update, delete on project_members to service_role;

-- 2. project_members_insertは自分自身のuser_roleしか見ておらず、対象projectのメンバーで
--    あるかを検証していなかった（規約29と同種の越境問題）。admin/pmであれば任意の案件へ
--    メンバーを追加できてしまう状態だったため、is_project_memberチェックを追加する。
--    （案件作成直後、作成者自身を最初のメンバーとして登録する処理は、この結果
--    createProject側でservice_roleクライアントを使う実装に変更した）
drop policy if exists "project_members_insert" on project_members;
create policy "project_members_insert" on project_members
  for insert with check (
    (auth.jwt() ->> 'user_role') = any (array['admin', 'pm'])
    and is_project_member(project_id)
  );

-- 3. 初回ログイン時のパスワード変更強制フラグ解除のため、本人が自分のuser_profilesの
--    force_password_resetのみを更新できるようにする。列単位GRANTにより、この経路から
--    user_role等の昇格ができないようにする（RLSは行単位のみで列は制限できないため）。
grant update (force_password_reset) on user_profiles to authenticated;
create policy "user_profiles_update_self" on user_profiles
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
