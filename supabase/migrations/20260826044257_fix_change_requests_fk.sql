-- item_sources（20260826004144）と同じ理由で、要件項目を削除するとchange_requestsも
-- FK制約違反で削除できなくなる。ただしchange_requestsは業務記録（変更履歴）のため、
-- item_sourcesのようにCASCADEで一緒に消すのではなく、行自体は残しitem_idのみnullにする。
-- before_content/after_contentにスナップショットが既にあるため、item_idがnullになっても
-- 履歴内容自体は失われない。
alter table change_requests drop constraint if exists change_requests_item_id_fkey;
alter table change_requests
  add constraint change_requests_item_id_fkey
  foreign key (item_id) references requirement_items(id) on delete set null;
