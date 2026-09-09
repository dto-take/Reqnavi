-- user_profiles(user_id)を参照する（auth.usersではない）。PostgRESTの埋め込みJOINで
-- requirement_items -> user_profiles を解決するには直接のFKが必要（規約14）。
-- effort_logs.recorded_byが同じ理由でuser_profiles(user_id)を参照している前例に倣う。
alter table requirement_items add column if not exists updated_by uuid references user_profiles(user_id);

create or replace function set_requirement_item_updated_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_updated_by on requirement_items;
create trigger set_updated_by
  before update on requirement_items
  for each row execute function set_requirement_item_updated_by();
