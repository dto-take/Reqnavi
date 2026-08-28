-- 自社（own）企業の恒久データ。これまでテスト用に手動SQLで別UUID（11111111-...）を
-- 投入していたが、マイグレーション管理下の正式な値としてこちらに統一する。
insert into companies (id, name, company_type)
values ('00000000-0000-0000-0000-000000000001', '自社', 'own')
on conflict (id) do nothing;
