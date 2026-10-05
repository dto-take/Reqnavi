-- 資料の登録：AI分類に失敗しても未分類として登録できるよう、失敗の印を持たせる。
alter table public.source_documents
  add column if not exists classification_failed boolean not null default false;

-- 登録に失敗したとき、アップロード済みのファイルを案件メンバー自身が消せるようにする。
-- 既存のDELETEポリシー（project_documents_delete）はadminのみ。メンバーに許すのは、
-- 「その案件のuploads配下で、source_documentsの行が参照していないファイル」に限る
-- （登録済みの資料のファイルを、メンバーが直接消せないようにするため）。
create policy project_documents_delete_unregistered_by_member on storage.objects
  for delete
  using (
    bucket_id = 'project-documents'
    and public.is_project_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = 'uploads'
    and not exists (select 1 from public.source_documents d where d.storage_path = objects.name)
  );
