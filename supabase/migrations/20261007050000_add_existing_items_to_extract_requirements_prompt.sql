-- 再生成でAI素案が、確認済み・不採用にした項目と同じ内容を再び出す問題（E2E C7b）への対応。
-- extract_requirementsをv5として追加する（既存のv1〜v4は書き換えない。ai_interactions.prompt_idが指すため）。
-- v4の本文に、「既に存在する項目」「不採用として扱った内容」の2つの節を足す。
-- 節の中身は、素案生成（generateDraft）が{existing_items}・{rejected_items}を置き換えて渡す。
-- temperature等の生成設定はコード側のため、変更しない。
update prompts set is_active = false where purpose = 'extract_requirements' and is_active = true;

insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v5',
  prompt_body || '

【既に存在する項目（同じ内容を出さないこと）】
この章には、人が確認・確定した次の項目が既にあります。これらと同じ、または実質的に同じ内容の項目は、出力しないでください。
{existing_items}

【不採用として扱った内容（再提案しないこと）】
次の内容は、人が不採用と判断しました。これらと同じ、または実質的に同じ内容は、再び提案しないでください。
{rejected_items}

【既存・不採用の項目との関係について】
上記に当てはまらない新しい内容が資料にある場合は、それは必ず抽出すること。
既存の項目と重なることを理由に、項目を0件にしないこと（重ならない内容だけを出力する）。',
  true
from prompts
where purpose = 'extract_requirements' and version = 'v4';
