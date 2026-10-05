-- 同じ資料の重複アップロードを防ぐため、資料のサイズを記録する（同じ案件・同じ名前・同じサイズ＝重複）。
-- 既存行は、Storage上のオブジェクトのサイズから補完する（見つからない行はNULL＝重複判定の対象外）。
alter table public.source_documents add column if not exists file_size bigint;

update public.source_documents d
set file_size = (o.metadata ->> 'size')::bigint
from storage.objects o
where o.bucket_id = 'project-documents'
  and o.name = d.storage_path
  and d.file_size is null;
