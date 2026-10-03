-- project_list_ux.md Step1：案件一覧の章ごとの集計（案件×章で1行）。
-- 項目の行を全件取得して画面側で数える方式はPostgRESTの既定上限（1000行）で黙って切り捨てられる
-- ため、DBで集計して返す。security invokerなのでRLS（is_project_member等）がそのまま効く。
--
-- 数え方は確定判定ダッシュボード（getReadinessSummary）・サイドバーの章ドット
-- （getSimpleChapterStatuses）に合わせる：
--   total_items     = 不採用（rejected）を除く行数
--   confirmed_items = そのうち confirmed / exception_approved の行数
--   all_items       = 不採用を含む行数（4章のサイドバー判定が不採用を除外しないため）
--   15章は requirement_items ではなく progress_tasks の行数（確定の概念は無い）
-- requirement_itemsには、同じ顧客の別案件の確定済み項目を参照できる横断参照のSELECTポリシーがあり、
-- 項目だけを集計すると、メンバーでない案件の行（確定済みのみの不完全な数）が混ざり得る。
-- 数が不完全になる案件を返さないよう、自分がメンバーの案件の行だけを返す。
-- どの章を確定率の分母に含めるか（A/B/C章のみ）は呼び出し側（src/lib/project-list/derive.ts）で行う。
create or replace function list_project_chapter_stats()
returns table (
  project_id      uuid,
  chapter_no      int,
  total_items     bigint,
  confirmed_items bigint,
  all_items       bigint,
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
    count(*) filter (where ri.status <> 'rejected'),
    count(*) filter (where ri.status in ('confirmed', 'exception_approved')),
    count(*),
    max(ri.updated_at),
    (array_agg(ri.updated_by order by ri.updated_at desc nulls last, ri.id))[1]
  from public.requirement_items ri
  where public.is_project_member(ri.project_id)
  group by ri.project_id, ri.chapter_no
  union all
  select
    pt.project_id,
    15,
    count(*),
    0::bigint,
    count(*),
    max(pt.created_at),
    null::uuid
  from public.progress_tasks pt
  where public.is_project_member(pt.project_id)
  group by pt.project_id
  order by 1, 2
$$;

revoke all on function list_project_chapter_stats() from public;
grant execute on function list_project_chapter_stats() to authenticated;
grant execute on function list_project_chapter_stats() to service_role;
