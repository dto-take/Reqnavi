-- 資料アップロードの1ファイルあたりの上限を20MBに明示する。
-- クライアント側の事前チェック（document-upload-zone.tsx）をすり抜けた場合でも、
-- Supabase Storage自体が拒否するようにする多重防御（upload_size_limit.md）。
update storage.buckets
set file_size_limit = 20971520
where id = 'project-documents';
