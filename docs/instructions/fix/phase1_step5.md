# 指示書：Phase1 Step5 AI素案生成（Flow 1：初期構築）

## 目的

Phase1 Step1で格納・分類した資料と、Step2〜4で作った各テンプレートを繋ぎ、資料の内容から要件項目の素案を自動生成する。**対象はテンプレートA・B・Cのみ**（フラットな行構造）。D（KPI）・E（非機能要件）は資料からの抽出より聞き取り主導になりやすいため対象外とする（`docs/01_requirements.md` §9 機能No.2、`docs/02_architecture.md` 5.1節を参照）。

## 前提確認

- Phase1 Step1〜4が完了していること
- `ai_interactions`テーブルにRLS・GRANTが設定されていないため、本Stepで併せて対応する

---

## Step 1: ai_interactions のRLS・GRANTを設定

```bash
supabase migration new add_ai_interactions_policies
```

```sql
grant select, insert, update, delete on ai_interactions to authenticated;

create policy "ai_interactions_select" on ai_interactions
  for select using (is_project_member(project_id));

create policy "ai_interactions_insert" on ai_interactions
  for insert with check (is_project_member(project_id));
```

`supabase db reset` で反映する。

## Step 2: AI呼び出しの共通ヘルパーを切り出す

Phase1 Step1で作った`getActivePrompt`（`classify-document.ts`内にプライベート関数として存在）を、共通利用できるよう`src/lib/ai/prompts.ts`に切り出す。

```ts
import { createServerActionClient } from "@/lib/supabase/server";

export async function getActivePrompt(purpose: string): Promise<{ id: string; body: string }> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("prompts")
    .select("id, prompt_body")
    .eq("purpose", purpose)
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error(`アクティブなプロンプトが見つかりません: ${purpose}`);
  return { id: data.id, body: data.prompt_body };
}
```

`src/lib/ai/classify-document.ts`側は、この共通関数をimportして使う形に書き換え、重複定義を削除する。

## Step 3: テンプレートA/B/C抽出用プロンプトをシード

```sql
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
```

**注意**：このプロンプトはA/B/C共通の1本とし、`{chapter_name}`・`{columns_description}`・`{document_excerpts}`をチャプター/テンプレートごとに埋め込む形にする（テンプレートごとにプロンプト本文を分けない）。将来精度を個別調整したくなった場合は、`purpose`を`extract_template_a`のように分割し、`prompt_ver`をそれぞれ独立させる。

## Step 4: Flow1ロジックを作成

新規ファイル `src/actions/ai-draft.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const DraftItemSchema = z.object({
  content: z.record(z.string(), z.string().nullable()),
  confidence: z.enum(["explicit", "inferred"]),
  source_ref: z.string().nullable(),
  ambiguous: z.boolean(),
  ambiguous_text: z.string().nullable(),
});
const DraftResponseSchema = z.object({ items: z.array(DraftItemSchema) });

const CHAPTER_NAMES: Record<number, string> = {
  5: "システム要件", 6: "開発スコープ", 7: "ビジネス要件", 8: "業務要件",
  9: "機能要件", 11: "データ移行要件", 12: "トレーニング要件",
  13: "システム運用要件", 14: "システム定着化支援要件",
};

export async function generateDraft(
  projectId: string,
  tenantId: string,
  chapterNo: number,
  templateType: "A" | "B" | "C"
) {
  const supabase = await createServerActionClient();
  const chapterName = CHAPTER_NAMES[chapterNo];
  if (!chapterName) throw new Error(`未対応の章です: ${chapterNo}`);

  // 1. 関連資料を取得（分類タグに章名が含まれるもののみ）
  const { data: documents, error: docError } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path, classified_tags")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify([chapterName])); // jsonb列のためJSON文字列化して渡す（CLAUDE.md規約20）
  if (docError) throw docError;
  if (!documents || documents.length === 0) {
    throw new Error(`「${chapterName}」に分類された資料がありません。先に資料をアップロード・分類してください。`);
  }

  // 2. 列定義を取得し、プロンプトに埋め込む説明文を作る
  const { data: columns, error: colError } = await supabase
    .from("chapter_column_templates")
    .select("column_key, label")
    .eq("template_type", templateType)
    .order("order_index");
  if (colError) throw colError;
  const columnsDescription = columns.map((c) => `${c.column_key}（${c.label}）`).join(", ");

  // 3. 資料抜粋を結合（テキスト系のみ。Step1同様の簡易実装）
  const excerpts = await Promise.all(
    documents.map(async (d) => {
      const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
      const text = file ? await file.text() : `[抽出不可: ${d.file_name}]`;
      return `--- ${d.file_name} ---\n${text.slice(0, 3000)}`;
    })
  );

  // 4. プロンプトを組み立ててGeminiを呼び出す
  const { id: promptId, body: promptBody } = await getActivePrompt("extract_requirements");
  const filledPrompt = promptBody
    .replace("{chapter_name}", chapterName)
    .replace("{columns_description}", columnsDescription)
    .replace("{document_excerpts}", excerpts.join("\n\n"));

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: filledPrompt,
  });

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = DraftResponseSchema.safeParse(JSON.parse(cleaned));

  // 5. ai_interactions に記録
  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { chapter_no: chapterNo, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) {
    throw new Error("AIの出力形式が不正でした。プロンプトまたはモデル出力を確認してください。");
  }

  // 6. requirement_items として保存（すべてai_draftステータス）
  for (const item of parsed.data.items) {
    const { data: inserted, error: insertError } = await supabase
      .from("requirement_items")
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        chapter_no: chapterNo,
        template_type: templateType,
        content: item.content,
        status: "ai_draft",
        ambiguous_flags: item.ambiguous ? [{ text: item.ambiguous_text }] : [],
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    // 出典を全対象資料に対して紐付ける（MVPでは項目単位の精密な紐付けは行わない）
    const sourceRows = documents.map((d) => ({
      item_id: inserted.id,
      source_id: d.id,
      location_note: item.source_ref,
    }));
    await supabase.from("item_sources").insert(sourceRows);
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

**注意事項（複数）**：
- `item_sources`テーブルにもRLS・GRANTが設定されていない可能性がある。Step1と同様の手順で確認・追加すること。
- `@google/genai`のAPI形（`ai.models.generateContent`の引数・戻り値の構造）は、Phase1 Step1で実装した`classify-document.ts`の実装を正として参照し、本コード例と差異があれば実装済みの方を優先すること（本指示書のサンプルは概形のみ）。
- 大量の資料・大きなファイルを結合する場合、プロンプトのトークン数が膨らむ。今回は1資料あたり3000文字に簡易的に制限しているが、資料が多い章ではこれで十分か動作確認時に確認すること。

## Step 5: 章ページにAI素案生成ボタンを追加

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`に、テンプレートA/B/Cの章でのみ表示するボタンを追加する。

```tsx
import { generateDraft } from "@/actions/ai-draft";
// ...既存のimportに追加

// ページ内、「+ 行を追加」ボタンの隣に追加
<form action={generateDraft.bind(null, id, tenantId, chapterNum, templateType as "A" | "B" | "C")}>
  <button className="h-8 px-3 bg-primary text-white rounded-md text-sm">
    AI素案を生成
  </button>
</form>
```

## Step 6: 動作確認

1. `/projects/{id}/documents` で、業務要件に関連する内容を含むテキストファイルをアップロードし、分類タグに「業務要件」が付くことを確認（Step1の続き）
2. `/projects/{id}/chapters/8` で「AI素案を生成」を押す
3. 資料の内容に基づいた行が`ai_draft`ステータスで複数追加されることを確認
4. 生成された項目のうち、資料に明記が無かった内容がnull（空欄）になっている、または生成されていないことを確認（推測で埋めていないか目視チェック）
5. `ai_interactions`テーブルに1件記録されていることをStudioで確認

## やってはいけないこと

- 資料に記載の無い内容を推測でAIに埋めさせない（プロンプトの`ambiguous`/`confidence`/nullの扱いを崩さない）
- 生成した項目を`ai_draft`以外のステータスで保存しない（SEの確認前に確定扱いにしない）
- テンプレートD・E（KPI・非機能要件）にこのFlow1を流用しない（対象外の方針を維持する）

## 完了条件

- [ ] `ai_interactions`・`item_sources`のRLS・GRANT設定済み
- [ ] `extract_requirements`プロンプトをシード済み
- [ ] `generateDraft`実装済み
- [ ] 8章（業務要件）等で実際にAI素案が生成され、出典・確度・曖昧フラグが正しく反映されることを確認済み
