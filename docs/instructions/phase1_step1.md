# 指示書：Phase1 Step1 資料格納・簡易分類

## 目的

案件に紐づく資料（要求定義書・提案書・業務フロー図・既存システム仕様書等、種類を問わず）をアップロードし、Supabase Storageに保存する。保存後、AIが「どの要件カテゴリに関係しそうか」を粗くタグ付けする。詳細仕様は `docs/02_architecture.md` 2.2節・`docs/01_requirements.md` §8-9（機能No.1）を参照。

## 前提確認

- Phase0 Step1〜3が完了していること（ログイン・案件作成・メンバー管理が動作すること）
- `source_documents`テーブルが存在すること（Phase0で作成済みのはずだが、RLS未設定の可能性がある）

---

## Step 1: Storageバケットと source_documents のRLSを設定

```bash
supabase migration new add_document_storage
```

```sql
-- Storageバケット作成（案件ごとにフォルダ分離）
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

-- Storage RLS：{project_id}/... のパスに対し、案件メンバーのみアップロード・参照可
create policy "project_documents_select" on storage.objects
  for select using (
    bucket_id = 'project-documents'
    and is_project_member((storage.foldername(name))[1]::uuid)
  );

create policy "project_documents_insert" on storage.objects
  for insert with check (
    bucket_id = 'project-documents'
    and is_project_member((storage.foldername(name))[1]::uuid)
  );

-- source_documents テーブルのRLS・GRANT（Phase0 Step3の教訓を踏まえ両方を設定）
grant select, insert, update, delete on source_documents to authenticated;

create policy "source_documents_select" on source_documents
  for select using (is_project_member(project_id));

create policy "source_documents_insert" on source_documents
  for insert with check (is_project_member(project_id));
```

`is_project_member()`関数はPhase0 Step3で作成済みのものを再利用する（新規作成しない）。

`supabase db reset` で反映する。

## Step 2: AI分類用のプロンプトをprompts テーブルに登録

```sql
insert into prompts (purpose, template_type, version, prompt_body, is_active)
values (
  'classify_document',
  null,
  'v1',
  'あなたはSIerの要件定義支援AIです。以下の資料の内容から、この資料がどの要件定義カテゴリに関連しそうかを判定してください。

判定対象カテゴリ（複数選択可）：
業務要件, 機能要件, 非機能要件, システム要件, ビジネス要件, データ移行要件, トレーニング要件, システム運用要件, その他

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"tags": ["カテゴリ名", ...], "summary": "資料内容の一文要約"}

【資料抜粋】
{document_excerpt}',
  true
);
```

## Step 3: AI分類ロジックを作成

新規ファイル `src/lib/ai/classify-document.ts`。

```ts
import { z } from "zod";

const ClassificationSchema = z.object({
  tags: z.array(z.string()),
  summary: z.string(),
});

export async function classifyDocument(excerpt: string) {
  const promptBody = await getActivePrompt("classify_document");
  const filledPrompt = promptBody.replace("{document_excerpt}", excerpt.slice(0, 4000));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: filledPrompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  const cleaned = text.replace(/```json|```/g, "").trim();

  const parsed = ClassificationSchema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) {
    return { tags: [], summary: "" };
  }
  return parsed.data;
}

async function getActivePrompt(purpose: string): Promise<string> {
  const { createServerActionClient } = await import("@/lib/supabase/server");
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("prompts")
    .select("prompt_body")
    .eq("purpose", purpose)
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error(`アクティブなプロンプトが見つかりません: ${purpose}`);
  return data.prompt_body;
}
```

**注意**：APIキーは環境変数から取得される想定（Anthropic API呼び出しの認証はプラットフォーム側で処理される場合は本コードから鍵の受け渡しを省略してよい。既存の`.env.local`にAPIキー変数が無い場合は、追加が必要かどうかをユーザーに確認すること。自己判断でキーをハードコードしない）。

## Step 4: アップロード用Server Actionを作成

新規ファイル `src/actions/documents.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { classifyDocument } from "@/lib/ai/classify-document";
import { revalidatePath } from "next/cache";

export async function uploadDocument(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const file = formData.get("file") as File;
  if (!file) throw new Error("ファイルが選択されていません");

  const storagePath = `${projectId}/uploads/${crypto.randomUUID()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, file);
  if (uploadError) throw uploadError;

  const excerpt = await extractExcerpt(file);
  const classification = await classifyDocument(excerpt);

  const { error: insertError } = await supabase.from("source_documents").insert({
    project_id: projectId,
    file_name: file.name,
    storage_path: storagePath,
    classified_tags: classification.tags,
  });
  if (insertError) throw insertError;

  revalidatePath(`/projects/${projectId}/documents`);
}

export async function listDocuments(projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, file_name, classified_tags, storage_path")
    .eq("project_id", projectId);
  if (error) throw error;
  return data;
}

// テキスト系ファイルのみ簡易対応。PDF/画像等の本格対応はPhase1後半で拡張する
async function extractExcerpt(file: File): Promise<string> {
  if (file.type === "text/plain" || file.type === "text/markdown") {
    return await file.text();
  }
  return `[ファイル名からの推測: ${file.name}]`;
}
```

**注意**：`extractExcerpt`は今回テキスト系ファイルのみの簡易実装。PDF・Excel・画像等からの本格的なテキスト抽出は、資料の種類が多様であるという要件（`01_requirements.md` §8）を踏まえ、別Stepで拡張する前提とする。このStepではまず「アップロード→保存→粗い分類」という一連の配線を通すことを優先する。

## Step 5: 資料アップロード画面を作成

新規ファイル `src/app/projects/[id]/documents/page.tsx`。デザイントークンはPhase0 Step1のものを踏襲する。

```tsx
import { listDocuments, uploadDocument } from "@/actions/documents";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documents = await listDocuments(id);
  const uploadWithId = uploadDocument.bind(null, id);

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">資料</h1>

      <form action={uploadWithId} className="flex items-center gap-2 mb-5">
        <input
          type="file"
          name="file"
          required
          className="text-sm flex-1 border border-border rounded-md px-2 py-1.5 bg-sidebar"
        />
        <button
          type="submit"
          className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium"
        >
          アップロード
        </button>
      </form>

      <div className="flex flex-col">
        {documents?.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-2.5 border-t border-[#F1F1EF]">
            <span className="text-sm text-primary">{d.file_name}</span>
            <div className="flex gap-1">
              {(d.classified_tags as string[])?.map((tag) => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded bg-hover text-secondary">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 6: 動作確認

1. 案件詳細画面から `/projects/{id}/documents` にアクセス
2. テキストファイル（`.txt`または`.md`）を1件アップロード
3. アップロード後、一覧に表示され、AIが判定したタグ（例：`業務要件` `機能要件`）がバッジとして表示されることを確認
4. `ai_interactions`テーブルへの記録は本Stepではまだ実装していない。Step3の`classifyDocument`実行時に`prompt_id`と結果を記録する処理は、次のStep（AI素案生成 Flow1）で合わせて追加する

## やってはいけないこと

- Storageのパスにproject_id以外のユーザー入力を無検証で使わない（パストラバーサル対策として、ファイル名はそのまま使わずUUIDプレフィックスを付与している点を維持する）
- AI分類結果をそのまま`confirmed`のような確定ステータスとして扱わない（あくまで参考タグ）
- PDF/Excel等のバイナリファイルに対して`file.text()`を呼ばない（文字化け・クラッシュの原因になる。Step3の`extractExcerpt`のtype分岐を維持する）

## 完了条件

- [ ] `project-documents`バケット作成・Storage RLS設定済み
- [ ] `source_documents`のRLS・GRANT設定済み
- [ ] AI分類プロンプトを`prompts`テーブルに登録済み
- [ ] テキストファイルのアップロード→分類タグ表示まで動作確認済み
