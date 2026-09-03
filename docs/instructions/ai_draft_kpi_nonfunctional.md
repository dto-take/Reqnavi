# 指示書：KPIツリー（4章）・非機能要件チェックリスト（10章）のAI素案生成

## 目的

これまでAI素案生成（Flow1）の対象外だった4章（KPI・階層ツリー構造）・10章（非機能要件・チェックリスト構造）に、それぞれの構造に合わせた専用のAI生成ロジックを追加する。

## 前提確認

- AI素案生成の一括実行（複数章選択）が完了していること
- `generateDraft`（Flow1）の実際のシグネチャ・戻り値の型を確認してから、同様のパターン（`useActionState`対応の要否含む）で実装すること（規約50）

---

## Step 1: KPIツリーのAI生成プロンプトを登録

```sql
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_kpi_tree', 'D', 'v1',
'あなたはSIerの要件定義支援AIです。以下の資料から、プロジェクトのKGI（最終ゴール）を1つ特定し、達成のための目標→戦略→戦術を階層的に整理してください。

資料に明記が無い階層は、資料全体の文脈から妥当な推測で補ってよい（この章は方向性を整理するための土台であり、後でSEが調整する前提）。

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{
  "goals": [
    {
      "text": "ゴールの内容",
      "objectives": [
        {
          "text": "目標の内容",
          "strategies": [
            { "text": "戦略の内容", "tactics": ["戦術1", "戦術2"] }
          ]
        }
      ]
    }
  ]
}

【資料抜粋】
{document_excerpts}',
true);
```

## Step 2: 非機能要件チェックリストのAI生成プロンプトを登録

```sql
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_nonfunctional_checklist', 'E', 'v1',
'あなたはSIerの要件定義支援AIです。以下の資料から、非機能要件を「可用性」「性能拡張性」「運用保守性」「移植性」「セキュリティ」の5つの観点で整理してください。

資料に明記が無い観点については、Salesforce導入プロジェクトにおける一般的・標準的な観点で構わない（後でSEが確認・調整する前提）。チェック項目のステータスは、資料の内容に関わらず全て「未」とすること（達成状況の判定はこの場では行わない）。

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{
  "categories": [
    {
      "category": "可用性",
      "overview": "この観点の概要（1〜2文）",
      "checklist": [{ "item": "チェック項目の内容" }]
    }
  ]
}

【資料抜粋】
{document_excerpts}',
true);
```

## Step 3: KPIツリーのAI生成ロジックを作成

新規ファイル `src/actions/ai-draft-kpi.ts`。既存の`ai-draft.ts`の資料取得・抜粋処理（`extractContent`の利用、`getActivePrompt`の利用）と同じパターンを踏襲する。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const TacticSchema = z.string();
const StrategySchema = z.object({ text: z.string(), tactics: z.array(TacticSchema) });
const ObjectiveSchema = z.object({ text: z.string(), strategies: z.array(StrategySchema) });
const GoalSchema = z.object({ text: z.string(), objectives: z.array(ObjectiveSchema) });
const KpiTreeResponseSchema = z.object({ goals: z.array(GoalSchema) });

export async function generateKpiDraft(projectId: string) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { data: documents } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify(["KPI"]));
  if (!documents || documents.length === 0) {
    throw new Error("「KPI」に分類された資料がありません。先に資料をアップロード・分類してください。");
  }

  const excerpts = await Promise.all(
    documents.map(async (d) => {
      const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
      if (!file) return `[取得不可: ${d.file_name}]`;
      const extracted = await extractContent(file as unknown as File);
      return extracted.kind === "text" ? `--- ${d.file_name} ---\n${extracted.content.slice(0, 3000)}` : `[テキスト抽出不可: ${d.file_name}]`;
    })
  );

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_kpi_tree");
  const filledPrompt = promptBody.replace("{document_excerpts}", excerpts.join("\n\n"));

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({ model: "gemini-2.5-flash", contents: filledPrompt })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = KpiTreeResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { chapter_no: 4, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new Error("AIの出力形式が不正でした。");

  await supabase
    .from("requirement_items")
    .delete()
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .eq("status", "ai_draft");

  for (const goal of parsed.data.goals) {
    const goalId = await insertKpiNode(supabase, projectId, tenantId, null, "ゴール", goal.text);
    for (const objective of goal.objectives) {
      const objectiveId = await insertKpiNode(supabase, projectId, tenantId, goalId, "目標", objective.text);
      for (const strategy of objective.strategies) {
        const strategyId = await insertKpiNode(supabase, projectId, tenantId, objectiveId, "戦略", strategy.text);
        for (const tactic of strategy.tactics) {
          await insertKpiNode(supabase, projectId, tenantId, strategyId, "戦術", tactic);
        }
      }
    }
  }

  revalidatePath(`/projects/${projectId}/chapters/4`);
}

async function insertKpiNode(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  projectId: string,
  tenantId: string,
  parentId: string | null,
  level: string,
  text: string
): Promise<string> {
  const { data, error } = await supabase
    .from("requirement_items")
    .insert({
      project_id: projectId,
      tenant_id: tenantId,
      chapter_no: 4,
      template_type: "D",
      parent_id: parentId,
      content: { level, text },
      status: "ai_draft",
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("KPIノードの作成に失敗しました");
  return data.id;
}
```

**注意**：`.insert().select().single()`を使っているため、規約13（作成直後の自己参照によるRLS拒否）に抵触しないか確認すること。`requirement_items`のINSERT用RLSポリシー（`reqnavi_insert`）は「案件メンバーであること」のみを条件にしており、作成直後の読み返しを妨げる自己参照は無いはずだが、念のため実機で確認すること。

## Step 4: 非機能要件チェックリストのAI生成ロジックを作成

新規ファイル `src/actions/ai-draft-nonfunctional.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CategorySchema = z.object({
  category: z.string(),
  overview: z.string(),
  checklist: z.array(z.object({ item: z.string() })),
});
const NonFunctionalResponseSchema = z.object({ categories: z.array(CategorySchema) });

export async function generateNonFunctionalDraft(projectId: string) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { data: documents } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify(["非機能要件"]));
  if (!documents || documents.length === 0) {
    throw new Error("「非機能要件」に分類された資料がありません。先に資料をアップロード・分類してください。");
  }

  const excerpts = await Promise.all(
    documents.map(async (d) => {
      const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
      if (!file) return `[取得不可: ${d.file_name}]`;
      const extracted = await extractContent(file as unknown as File);
      return extracted.kind === "text" ? `--- ${d.file_name} ---\n${extracted.content.slice(0, 3000)}` : `[テキスト抽出不可: ${d.file_name}]`;
    })
  );

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_nonfunctional_checklist");
  const filledPrompt = promptBody.replace("{document_excerpts}", excerpts.join("\n\n"));

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({ model: "gemini-2.5-flash", contents: filledPrompt })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = NonFunctionalResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { chapter_no: 10, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new Error("AIの出力形式が不正でした。");

  await supabase
    .from("requirement_items")
    .delete()
    .eq("project_id", projectId)
    .eq("chapter_no", 10)
    .eq("status", "ai_draft");

  const rows = parsed.data.categories.map((c) => ({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 10,
    template_type: "E",
    content: {
      category: c.category,
      overview: c.overview,
      checklist: c.checklist.map((item) => ({ item: item.item, status: "未" })),
    },
    status: "ai_draft",
  }));
  const { error } = await supabase.from("requirement_items").insert(rows);
  if (error) throw error;

  revalidatePath(`/projects/${projectId}/chapters/10`);
}
```

## Step 5: 各章ページにボタンを追加

`src/app/projects/[id]/chapters/4/page.tsx`に追加する。

```tsx
import { generateKpiDraft } from "@/actions/ai-draft-kpi";
import { SubmitButton } from "@/components/ui/submit-button";

<form action={async () => { "use server"; await generateKpiDraft(id); }}>
  <SubmitButton pendingText="生成中...">AI素案を生成</SubmitButton>
</form>
```

**注意**：`generateKpiDraft`は現時点で`throw`ベースのエラーハンドリングを想定している（`useActionState`化はしていない）。`<form action={...}>`から直接呼び出す場合、失敗時は`error.tsx`の対象になる（規約44の対象外＝`<form>`経由なのでこれは問題ない）。将来インラインエラー表示（`useActionState`パターン）に統一したくなった場合は、既存の`createEffortLog`等と同じ形に変更を検討する。

`src/app/projects/[id]/chapters/10/page.tsx`にも同様に`generateNonFunctionalDraft`のボタンを追加する。

## Step 6: 動作確認

1. 「KPI」に分類された資料がある案件で、4章のAI素案生成を実行し、ゴール→目標→戦略→戦術の階層が正しく作成されることを確認する
2. `KpiTree`コンポーネントで、生成された階層がインデント付きで正しく表示されることを確認する
3. 「非機能要件」に分類された資料がある案件で、10章のAI素案生成を実行し、5観点程度のカテゴリカードが作成されることを確認する
4. 各チェック項目のステータスが「未」で初期化されていることを確認する
5. 資料が無い状態で実行し、明確なエラーメッセージが表示されることを確認する
6. 再度生成を実行し、既存の`ai_draft`項目が新しい内容に置き換わり、重複しないことを確認する

## やってはいけないこと

- KPIツリーの階層を4階層（ゴール/目標/戦略/戦術）以外の深さで生成させない
- 非機能要件のチェック項目ステータスを「未」以外で生成しない

## 完了条件

- [ ] KPIツリー・非機能要件チェックリストのAI生成プロンプト登録済み
- [ ] 両方のServer Action実装済み
- [ ] 各章ページにボタン追加済み
- [ ] 動作確認済み
