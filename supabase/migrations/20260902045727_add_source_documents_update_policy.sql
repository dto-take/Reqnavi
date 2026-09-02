-- source_documentsはSELECT/INSERTポリシーのみでUPDATEポリシーが無く、
-- reclassifyDocument（再分類・updated_at更新）がRLSにより常に0行更新でサイレントに
-- 失敗していた（GRANTはUPDATE権限を含むが、RLS有効時はコマンドごとに個別のポリシーが
-- 必要で、無ければそのコマンドは常に拒否される。規約16）。
-- 実機検証で発見：reclassifyDocumentは{"error":null}を返すが、実際にはclassified_tags・
-- updated_atのいずれも更新されていなかった。
create policy "source_documents_update" on source_documents
  for update using (is_project_member(project_id));
