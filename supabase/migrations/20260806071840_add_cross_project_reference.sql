-- 案件横断で確定済み項目を参照可能かを判定するヘルパー関数（自己参照ではないため通常のsql関数でよいが、
-- 複数テーブルをまたぐ判定のためsecurity definerとする）。
-- search_path=''+スキーマ完全修飾はcustom_access_token_hook等と同じ理由（search_path hijacking対策）。
--
-- 重要：CLAUDE.md規約6「パートナーには組織横断機能（Phase4）を絶対に見せない」に対応するため、
-- 指示書のサンプルには無かったpartner除外を追加している。既存のreqnavi_access等（自案件内）は
-- パートナー×7章（コスト関連の強いビジネス要件）のみを個別に除外しているが、この関数が守る
-- 「他案件参照」自体はパートナーには章を問わず全面的に見せない機能のため、章による絞り込みではなく
-- partner全体を除外する。指示書のまま実装すると、パートナーが自案件では7章しか見れないのに
-- 他案件経由で（7章を含め）確定済み項目を覗けてしまう越境問題になる。
create or replace function can_view_cross_project_item(item_project_id uuid, item_status text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p_item
    join public.projects p_viewer on p_viewer.organization_id = p_item.organization_id
    join public.project_members pm on pm.project_id = p_viewer.id and pm.user_id = auth.uid()
    where p_item.id = item_project_id
      and p_item.allow_cross_project_reference = true
      and p_viewer.allow_cross_project_reference = true
      and item_status in ('confirmed', 'exception_approved')
      and (auth.jwt() ->> 'user_role') != 'partner'
  );
$$;

-- 既存のreqnavi_access（自案件のみ）に加えて、案件横断参照用のポリシーを追加する
-- （複数の permissive ポリシーはORで結合されるため、既存ポリシーは変更しない）
create policy "requirement_items_cross_project_select" on requirement_items
  for select using (
    can_view_cross_project_item(project_id, status)
  );

-- projectsテーブルには既存のUPDATEポリシーが無いことを確認済み（規約16）。
-- authenticatedへのUPDATE GRANTも無かった（select/insertのみ。規約12）ため、ここで追加する。
-- allow_cross_project_referenceは、PM/管理者のみ変更可能にする。
grant update on projects to authenticated;

create policy "projects_update_cross_reference" on projects
  for update using (
    is_project_member(id)
    and (auth.jwt() ->> 'user_role') in ('admin','pm')
  );

-- requirement_items_cross_project_selectにより他案件の項目行自体は見えるようになるが、
-- PostgRESTの埋め込みJOIN（requirement_items -> projects(name)）は、JOIN先のprojects行についても
-- 別途projects_selectのRLSを満たす必要がある。既存のprojects_select（自案件メンバー or admin/exec/pmo）
-- は他案件参照の関係を知らないため、参照元プロジェクトの名前が常に空になってしまう
-- （実機検証で発見：他案件の確定済み項目自体は正しく表示されるが、案件名部分だけ空欄になった）。
-- item_statusを問わない点が唯一の違いで、それ以外はcan_view_cross_project_itemと同じ関係性判定。
create or replace function can_view_cross_project_metadata(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p_target
    join public.projects p_viewer on p_viewer.organization_id = p_target.organization_id
    join public.project_members pm on pm.project_id = p_viewer.id and pm.user_id = auth.uid()
    where p_target.id = target_project_id
      and p_target.allow_cross_project_reference = true
      and p_viewer.allow_cross_project_reference = true
      and (auth.jwt() ->> 'user_role') != 'partner'
  );
$$;

create policy "projects_select_cross_reference" on projects
  for select using (
    can_view_cross_project_metadata(id)
  );
