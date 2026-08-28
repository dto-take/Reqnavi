-- 緊急修正：直前のマイグレーション（add_organizations_update_policy）で
-- grant update (user_role) on user_profiles to authenticated を追加した結果、
-- 既存の user_profiles_update_self（本人の行なら任意の列を更新可能）と組み合わさり、
-- 一般ユーザーが自分自身のuser_roleを書き換えて権限昇格できる状態になっていた。
-- 実機検証で確認済み：pm-testが自分自身をadminに変更できてしまった（PATCH成功・200）。
--
-- RLSポリシーは行単位の制御のみで列単位の制御ができないため（規約34と同種の問題）、
-- 「本人による更新」経路そのものでuser_role列の変更だけを拒否するBEFORE UPDATEトリガーを
-- 追加する。管理者による更新（user_profiles_update_role_by_admin）はJWTのuser_role='admin'を
-- 条件に許可し続ける。どのRLSポリシーが行を通したかに関わらず、この列の変更自体を
-- admin以外に対して一律で拒否するため、将来新しい更新ポリシーが追加された場合の
-- 同種の再発も防ぐ防御的な仕組みとする。
create or replace function reject_user_role_change_by_non_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_role is distinct from old.user_role
     and (auth.jwt() ->> 'user_role') != 'admin' then
    raise exception 'user_roleの変更には管理者権限が必要です';
  end if;
  return new;
end;
$$;

create trigger reject_user_role_change_by_non_admin_trigger
before update on public.user_profiles
for each row execute function reject_user_role_change_by_non_admin();
