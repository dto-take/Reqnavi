-- ベースラインの確定（baseline_snapshots＋baseline_item_snapshots）を、DB側の1関数（1トランザクション）で行う。
-- 項目のスナップショット（監査データ）を、アプリへ行を転送して再挿入する方式だと、PostgRESTの1000行上限で
-- 黙って切り捨てられるため、insert ... select でDB内で作り、行をアプリに通さない（規約62）。
-- 作成後、スナップショットの件数が元の件数と一致することを同じトランザクション内で確認し、
-- 一致しなければ例外にして全体をロールバックする（旧ベースラインのsuperseded化も巻き戻る）。
-- security invoker：RLS（pm/adminかつ案件メンバーのみ作成可）がそのまま効く。
-- 既存の挙動（版番号はアプリ側で採番、旧activeをsupersededにして新しいactiveを作る、全章の全行が対象）は変えない。
create or replace function create_baseline_snapshot(
  p_project_id    uuid,
  p_version_no    text,
  p_approval_note text,
  p_readiness     jsonb,
  p_tenant_id     uuid,
  p_approved_by   uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_baseline_id uuid;
  v_expected    bigint;
  v_inserted    bigint;
begin
  update public.baseline_snapshots
     set status = 'superseded'
   where project_id = p_project_id
     and status = 'active';

  insert into public.baseline_snapshots (project_id, tenant_id, version_no, status, approved_by, approval_note, readiness_snapshot)
  values (p_project_id, p_tenant_id, p_version_no, 'active', p_approved_by, p_approval_note, p_readiness)
  returning id into v_baseline_id;

  insert into public.baseline_item_snapshots (baseline_id, item_id, chapter_no, template_type, content, status_at_baseline)
  select v_baseline_id, ri.id, ri.chapter_no, ri.template_type, ri.content, ri.status
    from public.requirement_items ri
   where ri.project_id = p_project_id;
  -- 挿入文の件数ではなく、実際に保存された件数を数える
  select count(*) into v_inserted
    from public.baseline_item_snapshots bs
   where bs.baseline_id = v_baseline_id;

  select count(*) into v_expected
    from public.requirement_items ri
   where ri.project_id = p_project_id;

  if v_inserted <> v_expected then
    raise exception 'ベースラインのスナップショット件数が元の件数と一致しません（%/%）', v_inserted, v_expected;
  end if;

  return v_baseline_id;
end;
$$;

revoke all on function create_baseline_snapshot(uuid, text, text, jsonb, uuid, uuid) from public;
grant execute on function create_baseline_snapshot(uuid, text, text, jsonb, uuid, uuid) to authenticated;
grant execute on function create_baseline_snapshot(uuid, text, text, jsonb, uuid, uuid) to service_role;
