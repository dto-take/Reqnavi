-- Storageバケット作成（案件ごとにフォルダ分離）
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

-- Storage RLS：{project_id}/... のパスに対し、案件メンバーのみアップロード・参照可
create policy "project_documents_select" on storage.objects
  for select using (
    bucket_id = 'project-documents'
    and is_project_member((storage.foldername(name))[1]::uuid)
  );

create policy "project_documents_insert" on storage.objects
  for insert with check (
    bucket_id = 'project-documents'
    and is_project_member((storage.foldername(name))[1]::uuid)
  );

-- source_documents テーブルのRLS・GRANT（Phase0 Step3の教訓を踏まえ両方を設定）
grant select, insert, update, delete on source_documents to authenticated;

create policy "source_documents_select" on source_documents
  for select using (is_project_member(project_id));

create policy "source_documents_insert" on source_documents
  for insert with check (is_project_member(project_id));

-- promptsテーブルにはRLSは有効だが選択ポリシーが無く、classifyDocument()が
-- 有効なプロンプトを読み取れずRLSで拒否される（Phase0 Step3と同種の問題）ため追加する。
-- アクティブなプロンプトのみ、認証済みユーザー全員が閲覧可能にする。
grant select on prompts to authenticated;

create policy "prompts_select_active" on prompts
  for select using (is_active = true);

-- AI分類用プロンプトの登録
insert into prompts (purpose, template_type, version, prompt_body, is_active)
values (
  'classify_document',
  null,
  'v1',
  'あなたはSIerの要件定義支援AIです。以下の資料の内容から、この資料がどの要件定義カテゴリに関連しそうかを判定してください。

判定対象カテゴリ（複数選択可）：
業務要件, 機能要件, 非機能要件, システム要件, ビジネス要件, データ移行要件, トレーニング要件, システム運用要件, その他

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"tags": ["カテゴリ名", ...], "summary": "資料内容の一文要約"}

【資料抜粋】
{document_excerpt}',
  true
);
