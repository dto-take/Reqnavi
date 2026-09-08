# 指示書：業務フロー（As-Is/To-Be）のAI素案生成

## 目的

業務フロー（As-Is/To-Be）のステップ（担当者・処理内容・使用システム）を、資料からAIが自動生成できるようにする。

## 重要な設計判断：業務フローには「確定」概念が無い

`requirement_items`と異なり、`flow_nodes`には`status`列（ai_draft/confirmed等）が存在せず、誰でも自由に追加・削除・並び替えができる。そのため、これまでのFlow1のような「既存のai_draftのみ削除して再生成」という安全策が使えない。**このStepでは、AI生成は「その業務フロー（As-Is or To-Be）にまだ1件もステップが無い場合」にのみ実行可能とする**（＝初期構築専用。既にステップがある状態での上書き・追記は対象外とし、誤って手動編集済みの内容を失わせない）。

## 前提確認

- KPIツリー・非機能要件チェックリストのAI素案生成が完了していること
- `generateDraft`等の実際のシグネチャ・エラーハンドリング方式（`useActionState`パターンか`throw`ベースか）を確認してから、一貫した方式で実装すること（規約50）
- Geminiの実際に使用中のモデル名を、コードベース内の直近の呼び出し箇所で確認してから使うこと

---

## Step 1: 業務フローのAI生成プロンプトを登録

```sql
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_business_flow', null, 'v1',
'あなたはSIerの要件定義支援AIです。以下の資料から、業務プロセスの流れを、実行される順序どおりに整理してください。

各ステップについて、担当者（役割・部署名等）・処理内容・使用しているシステムやツールを特定してください。使用システムが資料に明記されていない場合はnullとしてください。

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{
  "steps": [
    { "role_lane": "担当者・役割", "label": "処理内容", "system_used": "使用システム、無ければnull" }
  ]
}

【資料抜粋】
{document_excerpts}',
true);
```

## Step 2: business-flow.tsのregenerateEdgesをexportする

`src/actions/business-flow.ts`の既存の`regenerateEdges`関数（Phase2 Step1で作成、現状は非export）の先頭に`export`を付け、他ファイルから呼び出せるようにする。中身は変更しない。

## Step 3: AI生成ロジックを作成

新規ファイル `src/actions/ai-draft-business-flow.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { regenerateEdges } from "@/actions/business-flow";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const StepSchema = z.object({
  role_lane: z.string(),
  label: z.string(),
  system_used: z.string().nullable(),
});
const FlowResponseSchema = z.object({ steps: z.array(StepSchema) });

const DOCUMENT_TAG_BY_FLOW_TYPE: Record<"business_asis" | "business_tobe", string> = {
  business_asis: "業務要件",
  business_tobe: "機能要件",
};

export async function generateBusinessFlowDraft(projectId: string, flowType: "business_asis" | "business_tobe") {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { count: existingCount } = await supabase
    .from("flow_nodes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("flow_type", flowType);
  if ((existingCount ?? 0) > 0) {
    throw new Error("既にステップが登録されているため、AI生成は実行できません（初期構築時のみ利用可能です）。既存のステップを全て削除してから再実行してください。");
  }

  const tag = DOCUMENT_TAG_BY_FLOW_TYPE[flowType];
  const { data: documents } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify([tag]));
  if (!documents || documents.length === 0) {
    throw new Error(`「${tag}」に分類された資料がありません。先に資料をアップロード・分類してください。`);
  }

  const excerpts = await Promise.all(
    documents.map(async (d) => {
      const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
      if (!file) return `[取得不可: ${d.file_name}]`;
      const extracted = await extractContent(file as unknown as File, d.file_name);
      return extracted.kind === "text" ? `--- ${d.file_name} ---\n${extracted.content.slice(0, 3000)}` : `[テキスト抽出不可: ${d.file_name}]`;
    })
  );

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_business_flow");
  const filledPrompt = promptBody.replace("{document_excerpts}", excerpts.join("\n\n"));

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({ model: "gemini-3.6-flash", contents: filledPrompt })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = FlowResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { flow_type: flowType, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new Error("AIの出力形式が不正でした。");

  const rows = parsed.data.steps.map((step, index) => ({
    project_id: projectId,
    tenant_id: tenantId,
    flow_type: flowType,
    label: step.label,
    role_lane: step.role_lane,
    system_used: step.system_used,
    order_index: index,
  }));
  const { error: insertError } = await supabase.from("flow_nodes").insert(rows);
  if (insertError) throw insertError;

  await regenerateEdges(projectId, flowType);
  revalidatePath(`/projects/${projectId}/business-flow`);
}
```

**注意**：`extractContent`の実際の引数（1引数か2引数か、`fileName`が必要か）を、既存の実装で必ず確認してから記述すること（前回`extractContent`の引数不足が実際に発見されている）。使用するモデル名も、その時点でコードベース内の他のGemini呼び出し箇所が使っている実際の値に合わせること。

## Step 4: 業務フロー画面にボタンを追加

`src/app/projects/[id]/business-flow/page.tsx`に、ステップ0件時のみ表示するAI生成ボタンを追加する。

```tsx
import { generateBusinessFlowDraft } from "@/actions/ai-draft-business-flow";

{steps.length === 0 && (
  <form action={async () => { "use server"; await generateBusinessFlowDraft(id, flowType); }}>
    <button className="h-9 px-4 bg-brand text-white rounded-md text-sm font-medium">
      AIでステップを生成
    </button>
  </form>
)}
```

**注意**：ステップが1件でもある場合はこのボタン自体を表示しない（Step3のガードと画面表示を一致させる）。

## Step 5: 動作確認

1. As-Is・To-Beともにステップが0件の状態の案件で、「業務要件」に分類された資料がある状態でAs-Isの「AIでステップを生成」を実行し、担当者・処理内容・使用システムを含むステップが順番通りに作成されることを確認する
2. 生成後、`SwimlaneDiagramEditor`で図として正しく表示されることを確認する
3. `flow_edges`が自動的に生成され、ステップ間が矢印で繋がっていることを確認する
4. 既にステップがある状態で再度AI生成を試み、明確なエラーメッセージが表示されることを確認する
5. To-Beでも同様に、「機能要件」に分類された資料から生成できることを確認する
6. 対応する分類タグの資料が無い状態で実行し、エラーメッセージが表示されることを確認する

## やってはいけないこと

- 既存のステップがある状態で、AI生成によって既存データを上書き・追記しない（Step3のガードを必ず維持する）
- `flow_edges`の生成を、既存の`regenerateEdges`と別の独自ロジックで再実装しない（Step2でexportしたものを再利用する）

## 完了条件

- [ ] `regenerateEdges`のexport化済み
- [ ] 業務フローのAI生成プロンプト登録済み
- [ ] `generateBusinessFlowDraft`実装済み（既存ステップがある場合のガード込み）
- [ ] 画面にボタン追加済み（0件時のみ表示）
- [ ] 動作確認済み
