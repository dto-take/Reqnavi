-- requirement_itemsにはSELECT/INSERT/UPDATEポリシーのみ存在し、DELETEポリシーが無かった
-- （KPIツリーのノード削除用）。既存ポリシーと同一の可視条件でDELETEを追加する。
create policy "reqnavi_delete" on requirement_items
  for delete using (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );
