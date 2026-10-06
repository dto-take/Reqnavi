-- 監査ログ（最小限）：破壊的・管理的な4つの操作（資料の削除・案件メンバーの削除・案件の削除・
-- ベースラインの確定）について、「誰が・いつ・どの案件の何を」したかを記録する。
--
-- 追記専用：記録後に、更新も削除もできない。
--  ・書き込みはサーバー側のコード（service_roleのクライアント）だけが行う。authenticatedにはinsertをGRANTしない
--  ・authenticatedにはselectだけ（RLSで、同じテナントのadminのみ）。service_roleにはselectとinsertだけ
--  ・UPDATE・DELETEのポリシーは作らない
-- 案件・ユーザーへの外部キーは持たない（案件の削除＝記録対象の操作そのもので、記録が消えてはならないため）。
-- 案件名・顧客名・実行者の表示名と全体の役割は、操作の時点のスナップショットを文字列で持つ。
create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  tenant_id     uuid not null,
  actor_id      uuid,
  actor_name    text,
  actor_role    text,
  action        text not null check (action in ('document.delete', 'member.remove', 'project.delete', 'baseline.confirm')),
  project_id    uuid,
  project_name  text,
  customer_name text,
  target_type   text,
  target_id     uuid,
  target_label  text,
  details       jsonb not null default '{}'::jsonb
);

create index audit_logs_tenant_occurred_idx on audit_logs (tenant_id, occurred_at desc);
create index audit_logs_project_idx on audit_logs (project_id);

alter table audit_logs enable row level security;

-- 新しい表には、既定でtruncate・references・trigger等が全ロールに付く（TRUNCATEはRLSを迂回して全件を消せる）。
-- 一度すべて外してから、必要なものだけ付ける。
revoke all on audit_logs from public, anon, authenticated, service_role;
grant select on audit_logs to authenticated;
grant select, insert on audit_logs to service_role;

create policy "audit_logs_select_admin" on audit_logs
  for select to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'user_role') = 'admin'
  );
