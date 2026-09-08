# 指示書：Phase1 Step8 Salesforce標準機能マッピング

## 目的

機能要件（9章・テンプレートC）の項目に対し、Salesforce標準機能での対応可否を提示する。プラットフォーム知識はコードに直書きせず`platform_knowledge_sets`/`platform_feature_mappings`テーブルに分離する（`docs/02_architecture.md` 2.6節、CLAUDE.md規約9）。詳細は `docs/01_requirements.md` §9（機能No.19）を参照。

## 前提確認

- Phase1 Step7（工数記録）が完了していること
- `projects.platform_knowledge_set_id`列は`02_architecture.md`には記載済みだが、**実際のマイグレーションはまだ実行していない**（本Stepで初めて追加する）

---

## Step 1: プラットフォーム知識テーブルを作成・シードし、既存案件に反映

```bash
supabase migration new add_platform_knowledge
```

```sql
create table platform_knowledge_sets (
  id            uuid primary key default gen_random_uuid(),
  platform_name text not null,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create table platform_feature_mappings (
  id                     uuid primary key default gen_random_uuid(),
  knowledge_set_id       uuid references platform_knowledge_sets(id),
  requirement_pattern    text not null,
  standard_feature       text,
  requires_customization boolean default false,
  notes                  text
);

alter table platform_knowledge_sets enable row level security;
alter table platform_feature_mappings enable row level security;

grant select, insert, update, delete on platform_knowledge_sets to authenticated;
grant select, insert, update, delete on platform_feature_mappings to authenticated;

-- 全ユーザーが参照可、書き込みはadminのみ（マスタデータのため）
create policy "platform_knowledge_sets_select" on platform_knowledge_sets
  for select using (auth.uid() is not null);
create policy "platform_knowledge_sets_insert" on platform_knowledge_sets
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

create policy "platform_feature_mappings_select" on platform_feature_mappings
  for select using (auth.uid() is not null);
create policy "platform_feature_mappings_insert" on platform_feature_mappings
  for insert with check ((auth.jwt() ->> 'user_role') = 'admin');

-- Salesforceナレッジセットを1件作成
insert into platform_knowledge_sets (id, platform_name, is_active)
values ('00000000-0000-0000-0000-0000000000f1', 'salesforce', true);

-- マッピングのシード（初期セット。運用しながら追加していく前提）
insert into platform_feature_mappings (knowledge_set_id, requirement_pattern, standard_feature, requires_customization, notes) values
  ('00000000-0000-0000-0000-0000000000f1', '商談管理', 'Opportunity', false, '標準の商談オブジェクトで対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '顧客管理', 'Account / Contact', false, '標準の取引先・取引先責任者で対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '承認フロー', 'Approval Process', false, '標準の承認プロセス機能で対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '見積管理', 'Quote', false, '標準の見積機能で対応可能（レイアウトのカスタマイズは別途）'),
  ('00000000-0000-0000-0000-0000000000f1', 'ダッシュボード', 'Dashboard', false, '標準のダッシュボード機能で対応可能'),
  ('00000000-0000-0000-0000-0000000000f1', '外部システム連携', null, true, '標準機能では対応不可。連携方式（REST API等）の個別検討が必要');

-- projectsに知識セット列を追加し、既存案件をsalesforceに紐付け
alter table projects add column if not exists platform_knowledge_set_id uuid references platform_knowledge_sets(id);
update projects set platform_knowledge_set_id = '00000000-0000-0000-0000-0000000000f1' where platform_knowledge_set_id is null;
```

`supabase db reset` で反映する。

## Step 2: AI素案生成（Flow1）に知識セットの文脈を注入

`src/actions/ai-draft.ts`の`generateDraft`を、9章（機能要件）実行時のみ`platform_feature_mappings`をプロンプトに含めるよう拡張する。

```ts
// generateDraft内、プロンプト組み立て部分の直前に追加
let platformContext = "";
if (chapterNo === 9) {
  const { data: project } = await supabase
    .from("projects")
    .select("platform_knowledge_set_id")
    .eq("id", projectId)
    .single();

  if (project?.platform_knowledge_set_id) {
    const { data: mappings } = await supabase
      .from("platform_feature_mappings")
      .select("requirement_pattern, standard_feature, requires_customization, notes")
      .eq("knowledge_set_id", project.platform_knowledge_set_id);

    platformContext = `\n\n【参考：Salesforce標準機能マッピング】\n` +
      mappings
        ?.map((m) => `- ${m.requirement_pattern} → ${m.standard_feature ?? "該当なし"}（${m.requires_customization ? "カスタム開発が必要" : "標準機能で対応可能"}）`)
        .join("\n");
  }
}

const filledPrompt = promptBody
  .replace("{chapter_name}", chapterName)
  .replace("{columns_description}", columnsDescription)
  .replace("{document_excerpts}", excerpts.join("\n\n") + platformContext);
```

`extract_requirements`プロンプト本文（Phase1 Step5で登録済み）に、以下の1文を追記する（プロンプトのUPDATE）。

```sql
update prompts
set prompt_body = prompt_body || '

【platform_feature列がある場合】上記のSalesforce標準機能マッピングの参考情報がある場合、そのままpattern一致で当てはめず、資料の記述内容と最も近いものを判断して埋めること。一致するものが無ければ null とし、無理に当てはめない。'
where purpose = 'extract_requirements';
```

## Step 3: 個別行への提案機能（手動追加した行にも対応）を作成

新規ファイル `src/actions/platform-suggestion.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function suggestPlatformFeature(itemId: string, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();

  const { data: item, error: itemError } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("id", itemId)
    .single();
  if (itemError) throw itemError;

  const { data: project } = await supabase
    .from("projects")
    .select("platform_knowledge_set_id")
    .eq("id", projectId)
    .single();
  if (!project?.platform_knowledge_set_id) return;

  const { data: mappings, error: mapError } = await supabase
    .from("platform_feature_mappings")
    .select("requirement_pattern, standard_feature, requires_customization")
    .eq("knowledge_set_id", project.platform_knowledge_set_id);
  if (mapError) throw mapError;

  const targetText = `${item.content.name ?? ""} ${item.content.detail ?? ""}`;

  // 1. まず単純な部分一致で当てはめを試みる（AI呼び出し不要のため低コスト）
  const directMatch = mappings.find((m) => targetText.includes(m.requirement_pattern));
  let resultText: string;

  if (directMatch) {
    resultText = directMatch.requires_customization
      ? `${directMatch.standard_feature ?? "該当なし"}（カスタム開発要）`
      : (directMatch.standard_feature ?? "該当なし");
  } else {
    // 2. 一致が無ければAIに最も近いものを判断させる
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const mappingList = mappings
      .map((m) => `${m.requirement_pattern} → ${m.standard_feature ?? "該当なし"}`)
      .join("\n");
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `以下の機能要件に最も近いSalesforce標準機能を1つ選ぶか、無ければ「該当なし（カスタム開発要）」と回答してください。回答は機能名のみ、説明文は不要です。\n\n【機能要件】${targetText}\n\n【マッピング一覧】\n${mappingList}`,
    });
    resultText = (response.text ?? "該当なし（カスタム開発要）").trim();
  }

  const nextContent = { ...item.content, platform_feature: resultText };
  const { error: updateError } = await supabase
    .from("requirement_items")
    .update({ content: nextContent })
    .eq("id", itemId);
  if (updateError) throw updateError;

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

**注意**：`getTenantId`はこの関数内では使用していない（`tenant_id`の書き込みが発生しないため）。importしているのは型の一貫性のためであり、未使用のままだとlintエラーになる場合は該当importを削除すること。

## Step 4: テーブルエディタに提案ボタンを追加（9章のみ）

`RequirementTable`コンポーネントに、9章でのみ表示する提案ボタンを追加する。汎用性を保つため、テンプレート種別による分岐ではなく、**呼び出し元から渡すオプションprop**で制御する。

```tsx
// RequirementTable.tsxのpropsに追加
export function RequirementTable({
  projectId,
  chapterNo,
  columns,
  items,
  showPlatformSuggestion = false, // 追加
}: {
  projectId: string;
  chapterNo: number;
  columns: ColumnDef[];
  items: RequirementItem[];
  showPlatformSuggestion?: boolean;
}) {
  // ...既存のロジックに追加
  function handleSuggest(item: RequirementItem) {
    startTransition(() => {
      suggestPlatformFeature(item.id, projectId, chapterNo);
    });
  }

  // 各行のステータス列の隣に追加
  {showPlatformSuggestion && item.status !== "confirmed" && (
    <button
      disabled={isPending}
      onClick={() => handleSuggest(item)}
      className="text-xs text-secondary underline"
    >
      Salesforce機能を提案
    </button>
  )}
}
```

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`側で、9章の場合のみ`showPlatformSuggestion={true}`を渡す。

```tsx
<RequirementTable
  projectId={id}
  chapterNo={chapterNum}
  columns={columns}
  items={items}
  showPlatformSuggestion={chapterNum === 9}
/>
```

## Step 5: 動作確認

1. `/projects/{id}/chapters/9` で「AI素案を生成」を実行し、`platform_feature`列にSalesforce標準機能の提案が含まれることを確認（資料の内容に応じて、対応可否が変わることを確認）
2. 手動で1行追加し、「名称」「内容」に「商談の進捗管理」等を入力後、「Salesforce機能を提案」ボタンを押す→`platform_feature`列に`Opportunity`が入ることを確認（単純一致のケース）
3. マッピングに無いような機能内容（例：「特殊な外部連携バッチ処理」）で提案を実行し、AIが「該当なし（カスタム開発要）」に近い回答を返すことを確認（AI判定のケース）
4. 6章・8章・12章（同じテンプレートCを使う他の章）では提案ボタンが表示されないことを確認

## やってはいけないこと

- Salesforce標準機能のマッピング情報をコード内に直接ハードコードしない（`platform_feature_mappings`テーブル経由を維持する）
- AIの提案結果を確定扱い（`confirmed`ステータスへの変更）にしない。あくまで`platform_feature`列の値を埋めるだけで、ステータスはSEの操作に委ねる
- `RequirementTable`にテンプレート種別（A/B/C）による分岐を追加しない（Step4の通り、章単位のオプションpropで制御する）

## 完了条件

- [ ] `platform_knowledge_sets`・`platform_feature_mappings`作成・シード済み
- [ ] 既存案件への`platform_knowledge_set_id`バックフィル済み
- [ ] Flow1（9章）にマッピング文脈が注入されることを確認済み
- [ ] 個別提案ボタンが9章のみで動作確認済み
