-- 案件削除機能のため、projectsを起点とする削除カスケードを全経路で成立させる。
--
-- Step1のgrep（"references projects(id)"）はprojectsを直接参照するテーブルしか
-- 見つけられないが、実際にはprojectsを直接参照しないテーブル（item_sources、
-- item_history、baseline_item_snapshots、ai_reconciliation_suggestions等、
-- project_id列を持たずrequirement_items/source_documents/baseline_snapshots経由でのみ
-- projectsに連なるテーブル）もある。これらのFKがON DELETE CASCADEになっていないと、
-- 中間テーブル（requirement_items等）がカスケード削除された時点で参照エラーになり、
-- 案件削除全体が失敗する。そのため実際のpg_constraintを確認し、projectsから連鎖する
-- 全経路のFKを洗い出した上で変更する（規約36の教訓：想定リストだけで済ませない）。
--
-- change_requests.item_id -> requirement_items は既存マイグレーション
-- （20260826044257_fix_change_requests_fk.sql）でON DELETE SET NULLに変更済みのため、
-- ここでは変更しない（要件項目削除時にも変更申請の記録自体は残す意図）。

alter table project_members drop constraint if exists project_members_project_id_fkey;
alter table project_members add constraint project_members_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table requirement_items drop constraint if exists requirement_items_project_id_fkey;
alter table requirement_items add constraint requirement_items_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table source_documents drop constraint if exists source_documents_project_id_fkey;
alter table source_documents add constraint source_documents_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table flow_nodes drop constraint if exists flow_nodes_project_id_fkey;
alter table flow_nodes add constraint flow_nodes_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table progress_tasks drop constraint if exists progress_tasks_project_id_fkey;
alter table progress_tasks add constraint progress_tasks_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table baseline_snapshots drop constraint if exists baseline_snapshots_project_id_fkey;
alter table baseline_snapshots add constraint baseline_snapshots_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table change_requests drop constraint if exists change_requests_project_id_fkey;
alter table change_requests add constraint change_requests_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table ai_interactions drop constraint if exists ai_interactions_project_id_fkey;
alter table ai_interactions add constraint ai_interactions_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table effort_logs drop constraint if exists effort_logs_project_id_fkey;
alter table effort_logs add constraint effort_logs_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

-- ここから、projectsを直接参照しない中間テーブルのFK（放置するとカスケード連鎖が
-- 途中で止まりFK違反になる経路）

alter table item_sources drop constraint if exists item_sources_source_id_fkey;
alter table item_sources add constraint item_sources_source_id_fkey
  foreign key (source_id) references source_documents(id) on delete cascade;

alter table item_history drop constraint if exists item_history_item_id_fkey;
alter table item_history add constraint item_history_item_id_fkey
  foreign key (item_id) references requirement_items(id) on delete cascade;

alter table baseline_item_snapshots drop constraint if exists baseline_item_snapshots_baseline_id_fkey;
alter table baseline_item_snapshots add constraint baseline_item_snapshots_baseline_id_fkey
  foreign key (baseline_id) references baseline_snapshots(id) on delete cascade;

alter table change_requests drop constraint if exists change_requests_baseline_id_fkey;
alter table change_requests add constraint change_requests_baseline_id_fkey
  foreign key (baseline_id) references baseline_snapshots(id) on delete cascade;

alter table ai_reconciliation_suggestions drop constraint if exists ai_reconciliation_suggestions_triggered_by_item_id_fkey;
alter table ai_reconciliation_suggestions add constraint ai_reconciliation_suggestions_triggered_by_item_id_fkey
  foreign key (triggered_by_item_id) references requirement_items(id) on delete cascade;

alter table ai_reconciliation_suggestions drop constraint if exists ai_reconciliation_suggestions_target_item_id_fkey;
alter table ai_reconciliation_suggestions add constraint ai_reconciliation_suggestions_target_item_id_fkey
  foreign key (target_item_id) references requirement_items(id) on delete cascade;

-- projectsにはDELETE用のGRANT・RLSポリシーがどちらも存在しなかった（規約12・16・47）。
-- GRANTが無い状態ではRLS以前の段階で全操作が拒否され、RLSポリシーが無い状態では
-- 0件更新（サイレント失敗）になる。案件削除はadminのみに許可する（規約9・指示書の設計方針）。
grant delete on projects to authenticated;

create policy "projects_delete_admin" on projects
  for delete using ((auth.jwt() ->> 'user_role') = 'admin');

-- storage.objects（project-documentsバケット）にもSELECT/INSERTポリシーしか無く、
-- DELETEポリシーが存在しなかった。deleteProjectのstorage.remove()がRLSにより
-- 常に0件削除でサイレントに失敗し、DB側のカスケード削除は成功する一方でStorage上の
-- ファイルだけが残る不整合を、実機検証（案件削除後にファイルが残存）で確認した。
-- 現状この削除経路はdeleteProject（admin限定）のみのため、同じくadmin限定にする。
create policy "project_documents_delete" on storage.objects
  for delete using (bucket_id = 'project-documents' and (auth.jwt() ->> 'user_role') = 'admin');
