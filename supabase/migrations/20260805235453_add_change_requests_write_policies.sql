-- change_requestsにはchapter_no列が存在しなかった（指示書が示唆していた通り）。
-- 一覧表示の簡潔さのため非正規化して直接持たせる。tenant_id列も存在しなかった
-- （他の全テーブルとの一貫性のため追加。規約5）。実データ0件のため両方NOT NULLで追加する。
alter table change_requests add column if not exists chapter_no int;
alter table change_requests add column if not exists tenant_id uuid;
alter table change_requests alter column chapter_no set not null;
alter table change_requests alter column tenant_id set not null;

grant select, insert, update, delete on change_requests to authenticated;

create policy "change_requests_insert" on change_requests
  for insert with check (
    is_project_member(project_id)
    and (auth.jwt() ->> 'user_role') != 'partner'
  );

create policy "change_requests_update" on change_requests
  for update using (
    is_project_member(project_id)
    and (auth.jwt() ->> 'user_role') != 'partner'
  );

-- 既存の"estimation_impact_partner_block"（Phase0由来）は、実機検証したところ意図と異なる
-- 挙動だった：RLSは行単位でしか制御できないため、estimation_impactが入っている行そのものが
-- パートナーから丸ごと見えなくなり、reason等の他フィールドも一切表示されない
-- （列単位のマスキングにはならない）。この案件のこの機能を初めて実データで動かした
-- Phase3 Step5で発覚。standardなis_project_memberベースのSELECTに戻し、
-- estimation_impactの列マスキングはアプリ層（listChangeRequests）で行う。
drop policy if exists "estimation_impact_partner_block" on change_requests;
create policy "change_requests_select" on change_requests
  for select using (is_project_member(project_id));
