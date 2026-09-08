# 指示書：テンプレートC列の精査（種別の章限定・区分の抽出品質改善）

## 目的

1. 「種別」列（`item_type`）は元々9章（機能要件）専用に設計した列だったが、テンプレートCの共通列として全章に表示されてしまっている。9章専用に限定する
2. 「区分・分類」列（`category`）が、AIの抽出結果で章名（例：「お客様概要」）がそのまま入り、実質的に意味を持たない値になっている。抽出プロンプトを改善する

## 前提確認

- 削除確認・トースト・インラインエラー・空状態案内が完了していること

---

## Step 1: item_typeを9章専用列に変更

`chapter_column_templates`の`applicable_chapters`の仕組み（TD-004対応時に導入済み）をそのまま使う。

```bash
supabase migration new restrict_item_type_to_chapter9
```

```sql
update chapter_column_templates
set applicable_chapters = array[9]
where column_key = 'item_type';
```

`supabase db reset` で反映する。

**注意**：既存の1・2・3・6・8・12章の項目データ自体（`content.item_type`の値）は変更しない。列を非表示にするだけであり、データは残る（将来この列を再度表示したくなった場合に備える）。

## Step 2: AI抽出プロンプトの「区分・分類」の埋め方を改善

`prompts`テーブルの`purpose = 'extract_requirements'`のプロンプトに、区分・分類の埋め方に関する指示を追加する。既存のプロンプトバージョン管理方針（既存行を書き換えず新バージョンを追加、旧バージョンを非アクティブ化）に従う。

```sql
-- 既存のアクティブなプロンプトを非アクティブ化
update prompts set is_active = false where purpose = 'extract_requirements' and is_active = true;

-- 新バージョンを追加（既存の本文をベースに、区分・分類に関する指示を追記）
insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v' || (regexp_replace(version, '^v', '')::int + 1),
  prompt_body || '

【区分・分類（category）フィールドについて】
章の名称（例：「お客様概要」「業務要件」等）をそのまま区分・分類の値として使わないこと。
資料の内容に応じた、より具体的な区分を付けること。
（例：「お客様概要」章であれば「会社情報」「経営課題」「組織体制」等、
「業務要件」章であれば実際の業務領域名等、章名より一段具体的な区分にする）',
  true
from prompts
where purpose = 'extract_requirements' and is_active = false
order by created_at desc
limit 1;
```

**注意**：`version`列が`'v1'`のような文字列形式であることを前提に、数値部分をインクリメントする式にしている。実際のバージョン採番規則が異なる場合はそれに合わせて調整すること。

## Step 3: 動作確認

1. `/projects/{id}/chapters/1`（お客様概要）にアクセスし、テーブルに「種別」列が表示されなくなっていることを確認する
2. `/projects/{id}/chapters/9`（機能要件）では、引き続き「種別」列が表示されることを確認する
3. 1章で改めて「AI素案を生成」を実行し、「区分・分類」に章名（「お客様概要」）ではなく、より具体的な区分（例：「会社情報」「経営課題」）が入ることを確認する
4. `prompts`テーブルで、新しいバージョンの`extract_requirements`が`is_active = true`、旧バージョンが`false`になっていることを確認する
5. 既存の1〜3・6・8・12章のデータ（過去にAI生成済みの項目）が、種別列が消えたこと以外は変更されずに残っていることを確認する

## やってはいけないこと

- 既存の`content.item_type`データを削除・書き換えない（列の表示・非表示のみを制御する）
- プロンプトの既存バージョンを直接UPDATEで上書きしない（新バージョンを追加し、旧バージョンを非アクティブ化する既存の運用方針を維持する）

## 完了条件

- [ ] `item_type`が9章専用になっていることを確認済み
- [ ] AI抽出プロンプトの新バージョンが登録・有効化されていることを確認済み
- [ ] 1章での再生成で、区分・分類がより具体的な値になることを確認済み
