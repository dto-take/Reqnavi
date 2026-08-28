-- platform_knowledge_sets / platform_feature_mappings / projects.platform_knowledge_set_id は
-- Phase0の20260731071151_add_platform_knowledge.sqlで既に作成済み（テーブル定義のみ、RLS・GRANT・
-- シードは未実施）。ここでは再create tableせず、欠けているRLS・GRANT・シードのみを追加する。

alter table platform_knowledge_sets enable row level security;
alter table platform_feature_mappings enable row level security;

grant select, insert, update, delete on platform_knowledge_sets to authenticated;
grant select, insert, update, delete on platform_feature_mappings to authenticated;

-- 全ユーザーが参照可、書き込みはadminのみ（マスタデータのため）
create policy "platform_knowledge_sets_select" on platform_knowledge_sets
  for select using (auth.uid() is not null);
create policy "platform_knowledge_sets_insert" on platform_knowledge_sets
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

create policy "platform_feature_mappings_select" on platform_feature_mappings
  for select using (auth.uid() is not null);
create policy "platform_feature_mappings_insert" on platform_feature_mappings
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

-- Salesforceナレッジセットを1件作成
insert into platform_knowledge_sets (id, platform_name, is_active)
values ('00000000-0000-0000-0000-0000000000f1', 'salesforce', true);

-- マッピングのシード（初期セット。運用しながら追加していく前提）
insert into platform_feature_mappings (knowledge_set_id, requirement_pattern, standard_feature, requires_customization, notes) values
  ('00000000-0000-0000-0000-0000000000f1', '商談管理', 'Opportunity', false, '標準の商談オブジェクトで対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '顧客管理', 'Account / Contact', false, '標準の取引先・取引先責任者で対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '承認フロー', 'Approval Process', false, '標準の承認プロセス機能で対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '見積管理', 'Quote', false, '標準の見積機能で対応可能（レイアウトのカスタマイズは別途）'),
  ('00000000-0000-0000-0000-0000000000f1', 'ダッシュボード', 'Dashboard', false, '標準のダッシュボード機能で対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '外部システム連携', null, true, '標準機能では対応不可。連携方式（REST API等）の個別検討が必要');

-- projects.platform_knowledge_set_id は既存列だが、既存案件をsalesforceに紐付ける
update projects set platform_knowledge_set_id = '00000000-0000-0000-0000-0000000000f1' where platform_knowledge_set_id is null;

-- 既存案件のバックフィルだけでは、このマイグレーション以降にcreateProjectで新規作成される
-- 案件のplatform_knowledge_set_idがNULLのままになり、Salesforce機能提案が働かない。
-- 02_architecture.md 2.6節の方針（Phase1はsalesforce固定でよい）に従い、列のデフォルト値として設定する。
alter table projects alter column platform_knowledge_set_id set default '00000000-0000-0000-0000-0000000000f1';

-- extract_requirementsプロンプト（Phase1 Step5で登録済み）に、Salesforceマッピング文脈を
-- 単純パターン一致で当てはめず判断すべき旨の指示を追記する
update prompts
set prompt_body = prompt_body || '

【platform_feature列がある場合】上記のSalesforce標準機能マッピングの参考情報がある場合、そのままpattern一致で当てはめず、資料の記述内容と最も近いものを判断して埋めること。一致するものが無ければ null とし、無理に当てはめない。'
where purpose = 'extract_requirements';
