# 指示書：分類カテゴリに「KPI」を追加（マイグレーション対応）

## 目的

`classify_document`プロンプトのカテゴリ一覧に「KPI」が含まれておらず、`generateKpiDraft`が資料を発見できない状態になっている。これをマイグレーションとして追加し、ローカル・Staging双方に反映できる形にする。

## 前提確認

- KPI分類の欠落が判明していること

---

## Step 1: マイグレーションを作成

```bash
supabase migration new add_kpi_to_classify_categories
```

```sql
update prompts set is_active = false where purpose = 'classify_document' and is_active = true;

insert into prompts (purpose, template_type, version, prompt_body, is_active)
select
  purpose,
  template_type,
  'v' || (regexp_replace(version, '^v', '')::int + 1),
  replace(prompt_body, 'お客様概要, プロジェクトの目的, ロードマップ,', 'お客様概要, プロジェクトの目的, ロードマップ, KPI,'),
  true
from prompts
where purpose = 'classify_document' and is_active = false
order by created_at desc
limit 1;
```

**注意**：`replace`は現在のプロンプト本文の文言（`お客様概要, プロジェクトの目的, ロードマップ,`という並び）に依存している。マイグレーション作成前に、対象のプロンプト本文を実際に確認し、この文字列が完全に一致するか確認すること。一致しない場合、`replace`が何も置換せずKPIが追加されないまま新バージョンだけが作られてしまう（サイレント失敗）ため、実行後に必ずStep2の確認を行うこと。

`supabase db reset` （ローカル）で反映する。

## Step 2: 反映内容を確認

```sql
select version, prompt_body from prompts where purpose = 'classify_document' and is_active = true;
```

`prompt_body`のカテゴリ一覧に「KPI」が含まれていることを目視確認する。含まれていなければ、Step1の`replace`対象文字列が実際の本文と一致していない可能性が高いため、実際の文言に合わせてマイグレーションを修正すること。

## Step 3: 動作確認

1. 「09_KPI設計資料.md」を資料としてアップロードする
2. `classified_tags`に「KPI」が含まれることを確認する
3. 4章で「AI素案を生成」を実行し、ゴール→目標→戦略→戦術の階層が正しく作成されることを確認する

## Step 4（任意）: Stagingへの反映

ローカルでの動作確認が済んだら、他のマイグレーションと合わせて`supabase db push`でStagingにも反映する（規約45の教訓に従い、`Already up to date`ではなく今回のマイグレーションが正しく適用されることを確認する）。

## やってはいけないこと

- このマイグレーションを、ローカルの`supabase db reset`だけで満足せず、Stagingへの反映を忘れない（既に他のAI機能はStagingで動作確認しているため、この修正が反映されないとStaging側だけKPI機能が動かないままになる）

## 完了条件

- [ ] マイグレーション作成・ローカル反映済み
- [ ] `prompt_body`にKPIが含まれることを確認済み
- [ ] サンプル資料でのKPI分類・AI素案生成の動作確認済み
- [ ] Stagingへの反映済み
