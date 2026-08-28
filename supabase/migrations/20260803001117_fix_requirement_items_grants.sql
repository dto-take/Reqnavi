-- CLAUDE.mdのチェックリスト（規約12）に基づき、以下のテーブルに欠けているGRANTを一括で補う
grant select, insert, update, delete on requirement_items to authenticated;
grant select, insert, update, delete on chapter_column_templates to authenticated;
grant select, insert, update, delete on change_requests to authenticated;

-- chapter_column_templatesは全ユーザーが参照できればよい（列定義マスタのため書き込みはadminのみ）
create policy "chapter_column_templates_select" on chapter_column_templates
  for select using (auth.uid() is not null);

create policy "chapter_column_templates_insert" on chapter_column_templates
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

-- requirement_itemsには既存のreqnavi_access（SELECTのみ）しかポリシーが無く、
-- テーブルエディタからのINSERT/UPDATEがGRANTを補っても全てRLSで拒否される状態だった。
-- reqnavi_accessと同一の可視条件をINSERT/UPDATEにも適用する（02_architecture.md 4章の元ポリシーの抜け漏れ分）。
create policy "reqnavi_insert" on requirement_items
  for insert with check (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );

create policy "reqnavi_update" on requirement_items
  for update using (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );

-- テンプレートAの列定義シード
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('A', 'issue',     '課題・要望',       'text', 1),
  ('A', 'solution',  'ソリューション',   'text', 2),
  ('A', 'kpi',       'KPI',              'text', 3),
  ('A', 'pros_cons', 'メリット・デメリット', 'text', 4)
on conflict (template_type, column_key) do nothing;
