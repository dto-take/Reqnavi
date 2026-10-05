-- 資料の削除（案件のメンバーであるadmin・pmのみ）。
-- source_documentsにはDELETEポリシーが無かった。item_sourcesは外部キー（ON DELETE CASCADE）で、
-- 資料の行と一緒に消える（項目の内容は残る）。
create policy source_documents_delete on public.source_documents
  for delete
  using (
    (auth.jwt() ->> 'user_role') in ('admin', 'pm')
    and public.is_project_member(project_id)
  );

-- Storageの資料ファイルの削除も、同じ条件（案件のメンバーであるadmin・pm）にする。
-- 従来のproject_documents_deleteは「adminなら、案件のメンバーでなくても」だったため、置き換える
-- （案件削除のStorage削除は、service-roleのクライアントで行うため影響しない）。
-- 部Aで追加した、案件メンバーが未登録ファイルだけを消せるポリシー（project_documents_delete_unregistered_by_member）は別。
drop policy if exists project_documents_delete on storage.objects;
create policy project_documents_delete on storage.objects
  for delete
  using (
    bucket_id = 'project-documents'
    and (auth.jwt() ->> 'user_role') in ('admin', 'pm')
    and public.is_project_member(((storage.foldername(name))[1])::uuid)
  );
