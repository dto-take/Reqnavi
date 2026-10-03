-- readiness_ch4_ch10.md Step2：確定判定の「総数・確定数」の定義をこの関数1か所に集約する。
-- 確定判定ダッシュボード・サイドバー・案件トップ・案件一覧は、すべてここから数える。
--
-- 章ごとの「数える単位」（total_items／confirmed_items）：
--   1〜3・5〜9・11〜14章 : 各項目（不採用を除く）。確定 = confirmed または exception_approved
--   4章（KPI）          : KPIノード（ゴール・目標・戦略・戦術のすべて。不採用を除く）。確定 = confirmed
--   10章（非機能要件）   : 採用中の観点（parent_idがnull。不採用を除く）。確定 = 観点のstatusがconfirmed
--                          チェック項目の行は数えない（観点単位で確定するため）
--   15章（進捗）         : progress_tasksの件数（確定の概念は無く、confirmed_itemsは常に0）
-- last_updated_at／last_updated_byは、その章の全行（不採用・チェック項目を含む）の最終更新。
-- exception_items は例外承認（exception_approved）の件数（A/B/C章のダッシュボード表示用）。
--
-- security invoker（RLSがそのまま効く）。requirement_itemsには同じ顧客の別案件の確定済み項目を
-- 参照できる横断参照のSELECTポリシーがあり、項目だけを集計するとメンバーでない案件の不完全な数が
-- 混ざり得るため、自分がメンバーの案件の行だけを返す。
-- p_project_id を渡すとその案件だけ、null（省略）なら見える全案件（案件一覧用）を返す。
drop function if exists list_project_chapter_stats();

create or replace function list_project_chapter_stats(p_project_id uuid default null)
returns table (
  project_id      uuid,
  chapter_no      int,
  total_items     bigint,
  confirmed_items bigint,
  exception_items bigint,
  last_updated_at timestamptz,
  last_updated_by uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ri.project_id,
    ri.chapter_no,
    count(*) filter (
      where ri.status <> 'rejected' and (ri.chapter_no <> 10 or ri.parent_id is null)
    ),
    count(*) filter (
      where (ri.chapter_no <> 10 or ri.parent_id is null)
        and case
          when ri.chapter_no in (4, 10) then ri.status = 'confirmed'
          else ri.status in ('confirmed', 'exception_approved')
        end
    ),
    count(*) filter (
      where ri.status = 'exception_approved' and ri.chapter_no not in (4, 10)
    ),
    max(ri.updated_at),
    (array_agg(ri.updated_by order by ri.updated_at desc nulls last, ri.id))[1]
  from public.requirement_items ri
  where public.is_project_member(ri.project_id)
    and (p_project_id is null or ri.project_id = p_project_id)
  group by ri.project_id, ri.chapter_no
  union all
  select
    pt.project_id,
    15,
    count(*),
    0::bigint,
    0::bigint,
    max(pt.created_at),
    null::uuid
  from public.progress_tasks pt
  where public.is_project_member(pt.project_id)
    and (p_project_id is null or pt.project_id = p_project_id)
  group by pt.project_id
  order by 1, 2
$$;

revoke all on function list_project_chapter_stats(uuid) from public;
grant execute on function list_project_chapter_stats(uuid) to authenticated;
grant execute on function list_project_chapter_stats(uuid) to service_role;
