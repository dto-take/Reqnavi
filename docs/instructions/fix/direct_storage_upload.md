# 指示書：資料アップロードを「クライアント直接Storage送信」方式に変更

## 目的

資料アップロードが、Next.jsのServer Actionのボディサイズ上限（既定1MB）、およびVercelのサーバーレス関数自体のペイロード上限（Node.jsランタイムで概ね4.5MB程度）により、大きめのPDF/Word/PowerPointファイルで失敗する（`Body exceeded 1 MB limit`、ステータス413）。ファイル本体をServer Actionの引数として送る現状の設計をやめ、**ブラウザから直接Supabase Storageにアップロードし、Server Actionには保存先のパスのみを渡す**方式に変更する。

## 前提確認

- カードの「名称」「内容」表示順の修正が完了していること

---

## Step 1: ブラウザ用Supabaseクライアントを確認・整備

`src/lib/supabase/client.ts`が既に存在するか確認する。無ければ`@supabase/ssr`の`createBrowserClient`を使って新規作成する。

```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

## Step 2: アップロード処理をクライアント側の直接Storage送信に変更

`src/components/domain/document-upload-zone.tsx`のアップロード処理を修正する。

```tsx
import { createClient } from "@/lib/supabase/client";
import { registerUploadedDocument } from "@/actions/documents";

async function uploadOneFile(projectId: string, file: File) {
  const supabase = createClient();
  const safeExtension = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  const storagePath = `${projectId}/uploads/${crypto.randomUUID()}${safeExtension}`;

  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, file);
  if (uploadError) throw uploadError;

  await registerUploadedDocument(projectId, storagePath, file.name);
}
```

**注意**：`storagePath`の組み立てルールは規約35（Storageキーに日本語ファイル名を含めない）を踏襲すること。

キュー処理部分（`startUpload`関数）の`uploadDocument(projectId, formData)`呼び出しを、`uploadOneFile(projectId, file)`に置き換える。

## Step 3: 軽量なServer Actionを作成

`src/actions/documents.ts`に、ファイル本体を受け取らない新しいServer Actionを追加する。

```ts
export async function registerUploadedDocument(projectId: string, storagePath: string, fileName: string) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const { data: file, error: downloadError } = await supabase.storage
    .from("project-documents")
    .download(storagePath);
  if (downloadError || !file) throw downloadError ?? new Error("アップロードしたファイルの取得に失敗しました");

  const classification = await classifyDocument(file as unknown as File, fileName);

  const { error: insertError } = await supabase.from("source_documents").insert({
    project_id: projectId,
    tenant_id: tenantId,
    file_name: fileName,
    storage_path: storagePath,
    classified_tags: classification.tags,
  });
  if (insertError) throw insertError;

  revalidatePath(`/projects/${projectId}/documents`);
}
```

**注意**：既存の`uploadDocument`関数（ファイル本体を受け取る旧実装）は、他に呼び出し箇所が無いことを`grep`で確認した上で削除すること（規約36・37）。`classifyDocument`の実際の引数を、現状の実装で必ず確認してから使うこと。

## Step 4: 動作確認

1. 1MB未満の小さいファイル（これまで通り）をアップロードし、正常に完了することを確認する
2. **2〜5MB程度のPDF・PowerPointファイル**をアップロードし、エラーが発生せず正常にアップロード・分類できることを確認する
3. アップロード後、Supabase Storageに実際にファイルが保存されていることを確認する
4. 分類タグが正しく付与されることを確認する
5. Stagingにも反映後、同様に大きめのファイルでアップロードを確認する（ローカルでは再現しない、Vercel特有のペイロード上限の問題であるため、Staging環境での確認が特に重要）

## やってはいけないこと

- Next.jsの`serverActions.bodySizeLimit`設定を引き上げるだけの対処に留めない（Vercel自体のペイロード上限は変わらないため、根本解決にならない）
- `uploadDocument`（旧実装）を、呼び出し箇所の確認をせずに削除しない

## 完了条件

- [ ] ブラウザ用Supabaseクライアント整備済み
- [ ] クライアント直接Storage送信への変更済み
- [ ] `registerUploadedDocument`実装済み
- [ ] 大きめファイルでのアップロードがローカル・Staging双方で動作確認済み
