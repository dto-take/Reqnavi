-- 案件トップ画面の「最近更新された資料」表示のため、資料のアップロード/再分類日時を保持する。
-- このプロジェクトはトリガーではなく各Server Action側で明示的にupdated_atをセットする方針
-- （src/actions/requirement-items.tsのupdateRequirementItemContent等と同じ規約）。
alter table source_documents add column if not exists updated_at timestamptz not null default now();
