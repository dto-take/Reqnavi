-- progress_ux_phase3.md：中工程間の「先行工程」関係を表すpredecessor_id（自己参照・nullable）を追加する。
-- 大工程（parent_id is null）には適用しないため、行自身がparent_idを持つ（＝中工程である）
-- 場合にのみpredecessor_idを設定できる制約を付ける。自己参照（自分自身を先行工程にする）も禁止する。
--
-- 先行工程として参照されているタスクが削除された場合は、参照側のpredecessor_idを
-- null化する（on delete set null）。大工程/中工程の階層（parent_id）とは異なり、
-- 先行関係はスケジュール上の任意のヒントであり、削除をブロックするほどの強い制約ではないため。
alter table progress_tasks add column if not exists predecessor_id uuid references progress_tasks(id) on delete set null;
create index if not exists progress_tasks_predecessor_id_idx on progress_tasks(predecessor_id);

alter table progress_tasks add constraint predecessor_only_for_tasks
  check (predecessor_id is null or parent_id is not null);
alter table progress_tasks add constraint predecessor_not_self
  check (predecessor_id is null or predecessor_id <> id);
