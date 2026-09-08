# 指示書：画面遷移図のAI素案生成・画面設計書Excel出力・案内文言の追加

## 目的

1. 画面遷移図（9章、`flow_type='screen_transition'`）をAIで自動生成できるようにする
2. 「画面イメージ」ページの件数が機能一覧全体と一致しない理由が利用者に伝わっていないため、案内文言を追加する
3. 画面情報（画面パターン・表示項目・操作・項目定義・外部IF定義）を「画面設計書」としてExcel形式でダウンロードできるようにする
4. PowerPoint出力ボタンの表示位置を確認・改善する

## 前提確認

- ナビゲーションの根本修正・ユーザー登録機能の追加が完了していること

---

## Step 1: PowerPoint出力ボタンの所在確認

`src/app/(app)/projects/[id]/page.tsx`に、`/api/projects/[id]/export-pptx`へのリンクが現在も存在するか確認する。存在する場合は、視認性を上げるため、既存の「Wordで出力」と並べて`Button`コンポーネント（`variant="secondary"`程度）に変更し、小さな文字リンクから独立したボタンに変更する。

## Step 2: 「画面イメージ」ページに案内文言を追加

「画面イメージ」（`/projects/[id]/chapters/9/screens`）は、9章の機能要件のうち**画面パターン・表示項目が入力されている項目のみ**を対象としている設計であることを利用者に伝える文言を追加する。

```tsx
<p className="text-xs text-secondary mb-4">
  9章の機能要件（全{items.length}件）のうち、画面情報が入力されている{screenItems.length}件を画面イメージとして表示しています。
  バッチ処理・外部連携等、画面を持たない機能要件は対象外です。
</p>
```

**注意**：`items`は既存の`listRequirementItems(projectId, 9)`の結果をそのまま使えばよく、新しいクエリの追加は不要。

## Step 3: 画面設計書（Excel）出力を作成

```bash
npm install xlsx --save
```

新規ファイル `src/app/api/projects/[id]/export-screens-xlsx/route.ts`。

```ts
import { NextRequest } from "next/server";
import { createServerActionClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createServerActionClient();

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();
  const { data: items } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", 9)
    .order("order_index");

  const screenItems = (items ?? []).filter((i) => (i.content?.screen_fields ?? "").trim() !== "");

  const XLSX = await import("xlsx");
  const rows = screenItems.map((i) => ({
    画面名: i.content.name ?? "",
    画面パターン: i.content.screen_pattern ?? "",
    表示項目: i.content.screen_fields ?? "",
    操作: i.content.screen_actions ?? "",
    項目定義: i.content.field_definitions ?? "",
    外部IF定義: i.content.external_if ?? "",
    対応機能: i.content.platform_feature ?? "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 20 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "画面設計書");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent((project?.name ?? "project"))}_画面設計書.xlsx`,
    },
  });
}
```

**注意**：`XLSX.write`の戻り値の型を実際に確認し、規約26（Node BufferをそのままResponseに渡さない）に従い`new Uint8Array(...)`で変換する。ファイル名の日本語対応（規約27）も維持する。

画面イメージページに、ダウンロードリンクを追加する。

```tsx
<a href={`/api/projects/${id}/export-screens-xlsx`} className="text-xs text-secondary underline">
  画面設計書をExcelでダウンロード
</a>
```

## Step 4: 画面遷移図のAI素案生成を作成

新規ファイル `src/actions/ai-draft-screen-transitions.ts`。既存の`generateBusinessFlowDraft`と同様の設計判断（**画面遷移図に1件でもノードがある場合は実行不可**）を踏襲する。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const TransitionSchema = z.object({ from: z.string(), to: z.string(), label: z.string().nullable() });
const TransitionResponseSchema = z.object({ transitions: z.array(TransitionSchema) });

export async function generateScreenTransitionDraft(projectId: string) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { count: existingCount } = await supabase
    .from("flow_nodes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("flow_type", "screen_transition");
  if ((existingCount ?? 0) > 0) {
    throw new Error("既に画面が登録されているため、AI生成は実行できません（初期構築時のみ利用可能です）。既存の画面を全て削除してから再実行してください。");
  }

  const { data: items } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", 9);
  const screenNames = (items ?? [])
    .filter((i) => (i.content?.screen_fields ?? "").trim() !== "")
    .map((i) => i.content.name as string);

  if (screenNames.length === 0) {
    throw new Error("画面情報が入力された機能要件がありません。先に9章で画面パターン・表示項目を入力してください。");
  }

  const { data: documents } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify(["機能要件"]));

  const excerpts = documents
    ? await Promise.all(
        documents.map(async (d) => {
          const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
          if (!file) return `[取得不可: ${d.file_name}]`;
          const extracted = await extractContent(file as unknown as File, d.file_name);
          return extracted.kind === "text" ? `--- ${d.file_name} ---\n${extracted.content.slice(0, 3000)}` : `[テキスト抽出不可: ${d.file_name}]`;
        })
      )
    : [];

  const { id: promptId, body: promptBody } = await getActivePrompt("extract_screen_transitions");
  const filledPrompt = promptBody
    .replace("{screen_names}", screenNames.join(", "))
    .replace("{document_excerpts}", excerpts.join("\n\n") || "（参考資料なし。画面名から一般的な遷移を推測してください）");

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({ model: "gemini-3.6-flash", contents: filledPrompt })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = TransitionResponseSchema.safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { flow_type: "screen_transition", screen_count: screenNames.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new Error("AIの出力形式が不正でした。");

  const nodeIdByName = new Map<string, string>();
  for (let i = 0; i < screenNames.length; i++) {
    const { data, error } = await supabase
      .from("flow_nodes")
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        flow_type: "screen_transition",
        label: screenNames[i],
        order_index: i,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("画面ノードの作成に失敗しました");
    nodeIdByName.set(screenNames[i], data.id);
  }

  const edgeRows = parsed.data.transitions
    .filter((t) => nodeIdByName.has(t.from) && nodeIdByName.has(t.to))
    .map((t) => ({
      from_node: nodeIdByName.get(t.from)!,
      to_node: nodeIdByName.get(t.to)!,
      label: t.label,
    }));
  if (edgeRows.length > 0) {
    const { error: edgeError } = await supabase.from("flow_edges").insert(edgeRows);
    if (edgeError) throw edgeError;
  }

  revalidatePath(`/projects/${projectId}/chapters/9/screen-transitions`);
}
```

プロンプトを登録する。

```sql
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_screen_transitions', null, 'v1',
'あなたはSIerの要件定義支援AIです。以下の画面名一覧と資料から、画面同士の遷移関係を整理してください。

一覧に無い画面名を新たに作らず、必ず与えられた画面名一覧の中から遷移元・遷移先を選んでください。

【画面名一覧】
{screen_names}

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"transitions": [{"from": "遷移元の画面名", "to": "遷移先の画面名", "label": "遷移のきっかけ（例：詳細押下）、無ければnull"}]}

【資料抜粋】
{document_excerpts}',
true);
```

`src/app/(app)/projects/[id]/chapters/9/screen-transitions/page.tsx`に、ノード0件時のみ表示するボタンを追加する（既存の`generateBusinessFlowDraft`ボタンの実装パターンと同じ形にする）。

## Step 5: 動作確認

1. 9章に画面情報（画面パターン・表示項目）が入力された項目を3〜4件用意し、画面遷移図が0件の状態で「AIで画面遷移を生成」を実行する
2. 画面名がノードとして作成され、AIが推測した遷移がedgeとして作成されることを確認する
3. 既に画面遷移図にノードがある状態で再実行し、明確なエラーメッセージが表示されることを確認する
4. 「画面イメージ」ページで、案内文言（全件数のうち画面情報がある件数）が表示されることを確認する
5. 「画面設計書をExcelでダウンロード」からファイルをダウンロードし、画面情報の列がすべて含まれていることを確認する
6. 「PowerPointで出力」ボタンが引き続き案件トップ画面から機能することを確認する

## やってはいけないこと

- 画面遷移図に既存ノードがある状態で、AI生成によって上書き・追記しない
- AIが提案した遷移の`from`/`to`が画面名一覧に無い場合、新しいノードを勝手に作らない（スキップする）

## 完了条件

- [ ] PowerPoint出力ボタンの所在確認・視認性改善済み
- [ ] 画面イメージページの案内文言追加済み
- [ ] 画面設計書Excel出力実装済み
- [ ] 画面遷移図のAI素案生成実装済み
- [ ] 動作確認済み
