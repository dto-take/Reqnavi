-- 3章（ロードマップ）でAI素案生成が0件になる不具合の、残り最後の原因への対応。
--
-- 経緯（pdf_multimodal_input.mdでの調査）：資料抜粋の文字数切り詰め（規約56）とofficeparserの
-- 表・図の構造崩壊（規約57）への対応（PDF原本のマルチモーダル入力）を行った後も、
-- キックオフPDFのガントチャート形式スケジュール表からは依然として0件のままだった。
--
-- 制約無しの自然文プロンプトで同じPDFを渡すと、日付・担当・マーク等まで完全に正しく
-- 読み取れることを確認済み（規約57）。原因はテキスト抽出やPDF読解の失敗ではなく、
-- extract_requirementsプロンプトの「"{chapter_name}"章の要件項目を抽出してください」という
-- 枠組み自体が、ガントチャート形式のスケジュール表を「これは要件ではない」とGeminiに
-- 正当に判断させ、除外していたことだった。
--
-- 実際に「ロードマップ章ではスケジュール表・ガントチャートの内容も抽出対象の要件項目として
-- 扱う」という一文を追加したところ、導入スケジュール・要件定義スケジュールの両ページから
-- 正確な日付・フェーズ名を伴う項目が安定して生成されることを確認済み。
-- 追加する指示はロードマップ章にのみ適用される内容のため、他章の抽出結果には影響しない。
update prompts set is_active = false where purpose = 'extract_requirements' and is_active = true;

insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v' || (regexp_replace(version, '^v', '')::int + 1),
  prompt_body || '

【ロードマップ章について】
ロードマップ章では、ガントチャートやスケジュール表に記載されたフェーズ名・作業項目・実施時期も
抽出対象の要件項目として扱うこと。厳密な要求仕様の記述でなくても、プロジェクトの進行計画
そのものがこの章の主要な内容である。表形式・図形式で記載されている場合でも、内容が読み取れる
範囲で抽出し、「要件らしい記述ではない」ことを理由に項目を0件にしないこと。',
  true
from prompts
where purpose = 'extract_requirements' and is_active = false
order by created_at desc
limit 1;
