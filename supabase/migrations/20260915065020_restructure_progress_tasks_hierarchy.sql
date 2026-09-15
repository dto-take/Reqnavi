-- progress_ux_phase1.md：15章（進捗）を、フラットなタスク一覧＋進捗率スライダーから、
-- 大工程／中工程の2階層＋WBS/ガント＋詳細パネルの構成に置き換える。
-- 「進捗率・完了・締切・遅延の概念は完全に廃止する」という方針のため、percent_completeを削除する。
-- Staging実データ確認済み：既存3行はすべてTEST用データでpercent_completeは全件0
--（実運用でこの列が使われていた形跡なし）。

-- 大工程/中工程の階層。null=大工程、値があれば中工程としてその大工程に属する。
-- KPIツリー（requirement_items）と同様、削除はアプリ側で子の有無を確認してから行う運用とし、
-- ON DELETE CASCADEは付けない（大工程削除で配下の中工程が無言で消える事故を防ぐ）。
alter table progress_tasks add column if not exists parent_id uuid references progress_tasks(id);
create index if not exists progress_tasks_parent_id_idx on progress_tasks(parent_id);

-- 同じ階層内での並び順（末尾追加のみが本フェーズの対象。ドラッグでの並べ替えはフェーズ3）。
alter table progress_tasks add column if not exists order_index int not null default 0;

-- order_indexの同点時のタイブレーカー（規約42：order_indexだけでは同点の順序が不定になるため、
-- created_atを第二キーにする）。既存テーブルにcreated_at列が無かったため追加する。
alter table progress_tasks add column if not exists created_at timestamptz not null default now();

-- 大工程（parent_id is null）は期間を子から自動集計する表示専用の値のため、DBには保存しない。
-- 中工程（parent_id is not null）は開始日・終了日を必須のまま維持する。
alter table progress_tasks alter column week_start drop not null;
alter table progress_tasks alter column week_end drop not null;
alter table progress_tasks add constraint child_requires_dates
  check (parent_id is null or (week_start is not null and week_end is not null));

-- 進捗率・完了の概念を完全に廃止する。
alter table progress_tasks drop constraint if exists progress_tasks_percent_complete_check;
alter table progress_tasks drop column if exists percent_complete;
