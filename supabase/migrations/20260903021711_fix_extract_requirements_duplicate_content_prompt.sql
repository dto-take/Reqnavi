-- 3章（ロードマップ）でAI素案生成を実行しても項目が0件になる不具合の修正。
--
-- 原因調査（実データで再現・特定）：資料の抽出・分類・章名一致・列定義・保存経路は
-- すべて正常に動作していた。実際にステージングの対象案件・資料（01_提案書.md、
-- 08_プロジェクトキックオフ資料.pptx）をダウンロードし、generateDraftと同一のプロンプトを
-- 直接Geminiに送って検証したところ、各資料を単独で渡した場合は毎回正しく4件抽出できるが、
-- 2資料を組み合わせて渡すと（本番と同条件）、同一のスケジュール内容が両資料に重複して
-- 記載されているため、モデルの応答が「0件」「重複して8件」の間で不安定になることを確認した
-- （5回中の再現率は資料次第だが、実際に0件を複数回観測）。
-- src/actions/ai-draft.tsのgenerateContent呼び出しにtemperature: 0.1を追加した上で、
-- 以下の重複対応の指示を追加することで、5回連続で正しく4件に安定することを確認済み。
update prompts set is_active = false where purpose = 'extract_requirements' and is_active = true;

insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v' || (regexp_replace(version, '^v', '')::int + 1),
  prompt_body || '

【複数資料に同じ内容が記載されている場合について】
複数の資料に同じ、または類似した内容（同じスケジュール・同じ体制等）が重複して記載されている場合、
その内容は1件の項目として統合し、必ず抽出すること（資料ごとに重複して複数件出力しない）。
重複や資料間の表現の違いを理由に項目を0件にしないこと。',
  true
from prompts
where purpose = 'extract_requirements' and is_active = false
order by created_at desc
limit 1;
