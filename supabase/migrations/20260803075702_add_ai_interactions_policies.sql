grant select, insert, update, delete on ai_interactions to authenticated;

create policy "ai_interactions_select" on ai_interactions
  for select using (is_project_member(project_id));

create policy "ai_interactions_insert" on ai_interactions
  for insert with check (is_project_member(project_id));

-- item_sourcesにもRLS・GRANTが未設定だった（project_id/tenant_idを持たないため、
-- requirement_items経由でis_project_memberを判定する）。Flow1で出典を保存するために必要。
grant select, insert, update, delete on item_sources to authenticated;

create policy "item_sources_select" on item_sources
  for select using (
    exists (
      select 1 from requirement_items ri
      where ri.id = item_sources.item_id
        and is_project_member(ri.project_id)
    )
  );

create policy "item_sources_insert" on item_sources
  for insert with check (
    exists (
      select 1 from requirement_items ri
      where ri.id = item_sources.item_id
        and is_project_member(ri.project_id)
    )
  );

-- テンプレートA/B/C共通の抽出用プロンプト（Flow1）
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_requirements', null, 'v1',
'あなたはSIerの要件定義支援AIです。以下の資料抜粋から、"{chapter_name}"章の要件項目を抽出してください。

抽出すべきフィールド（{columns_description}）ごとに、資料に明記されている情報のみを埋めてください。
資料に記載が無いフィールドは null とし、絶対に推測で埋めないでください。

各項目について：
- 資料に明記されている情報か、文脈からの推測かを confidence（"explicit"|"inferred"）で示す
- 根拠となった資料箇所を source_ref に記載する（無ければ null）
- 資料の記述が抽象的で判断基準が書かれていない場合（例：「等」「柔軟に対応」等）、ambiguous: true とし、該当箇所を ambiguous_text に引用する

出力は以下のJSON形式のみとし、説明文・コードブロック記号は一切含めないこと。
{"items": [{"content": {"列キー": "値", ...}, "confidence": "explicit", "source_ref": "...", "ambiguous": false, "ambiguous_text": null}]}

【資料抜粋】
{document_excerpts}',
true);
