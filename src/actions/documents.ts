"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyDocument } from "@/lib/ai/classify-document";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { fetchAllPages } from "@/lib/paged-select";
import { revalidatePath } from "next/cache";

// ファイル本体はクライアントから直接Supabase Storageへアップロード済み（規約：
// Next.jsのServer Actionボディサイズ上限・Vercelサーバーレス関数のペイロード上限に
// 大きめのPDF/Word/PowerPointファイルが引っかかるため、direct_storage_upload.mdの方針で
// document-upload-zone.tsx側に移した）。このServer Actionはstorage_pathのみを受け取り、
// 分類・DB登録のみを担当する軽量な処理にする。
// 注意：storage_pathからのdownloadはBlobを返す（Fileではない）。classifyDocumentは
// 元々Blobを受け取る設計（reclassifyDocumentInternal参照）のため、不要なキャストはしない。
// 同じ案件に、同じ名前かつ同じサイズの資料が登録済みか（名前が同じでもサイズが違う更新版は重複ではない）
async function isDuplicateDocument(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  projectId: string,
  fileName: string,
  fileSize: number
): Promise<boolean> {
  const { count, error } = await supabase
    .from("source_documents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("file_name", fileName)
    .eq("file_size", fileSize);
  if (error) throw new UserFacingError(errorMessage(error));
  return (count ?? 0) > 0;
}

// アップロード前の確認（ブラウザはStorageへ送る前に呼ぶ。重複なら送らずにスキップする）
export async function checkDuplicateDocument(projectId: string, fileName: string, fileSize: number): Promise<boolean> {
  const supabase = await createServerActionClient();
  return isDuplicateDocument(supabase, projectId, fileName, fileSize);
}

export async function registerUploadedDocument(projectId: string, storagePath: string, fileName: string): Promise<"done" | "skipped"> {
  const supabase = await createServerActionClient();

  const { data: file, error: downloadError } = await supabase.storage
    .from("project-documents")
    .download(storagePath);
  if (downloadError || !file) {
    throw new UserFacingError(downloadError ? errorMessage(downloadError) : "アップロードしたファイルの取得に失敗しました");
  }

  // アップロード前の確認をすり抜けた重複（同時アップロード等）は、ここで登録せず、送られたファイルも消す。
  // Storageの削除はadminのみ許可のため、対象をこの案件のuploads配下の1件に限り、service-roleで消す。
  if (await isDuplicateDocument(supabase, projectId, fileName, file.size)) {
    if (storagePath.startsWith(`${projectId}/uploads/`)) {
      await createAdminClient().storage.from("project-documents").remove([storagePath]);
    }
    return "skipped";
  }

  const classification = await classifyDocument(file, fileName);

  const { error: insertError } = await supabase.from("source_documents").insert({
    project_id: projectId,
    file_name: fileName,
    file_size: file.size,
    storage_path: storagePath,
    classified_tags: classification.tags,
  });
  if (insertError) throw new UserFacingError(errorMessage(insertError));

  revalidatePath(`/projects/${projectId}/documents`);
  return "done";
}

// 分類プロンプトのカテゴリ一覧を修正した際など、既存資料を再アップロードせずに
// 分類だけ再実行できるようにする（ストレージ上のファイルをそのまま使う）
async function reclassifyDocumentInternal(documentId: string, projectId: string) {
  const supabase = await createServerActionClient();

  const { data: docData, error: docError } = await supabase
    .from("source_documents")
    .select("storage_path, file_name")
    .eq("id", documentId)
    .single();
  if (docError) throw docError;
  const doc = docData as unknown as { storage_path: string; file_name: string };

  const { data: file, error: downloadError } = await supabase.storage
    .from("project-documents")
    .download(doc.storage_path);
  if (downloadError || !file) throw downloadError ?? new UserFacingError("資料のダウンロードに失敗しました");

  const classification = await classifyDocument(file, doc.file_name);

  const { error: updateError } = await supabase
    .from("source_documents")
    .update({ classified_tags: classification.tags, updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (updateError) throw updateError;

  revalidatePath(`/projects/${projectId}/documents`);
}

export async function reclassifyDocument(
  documentId: string,
  projectId: string,
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    await reclassifyDocumentInternal(documentId, projectId);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function listDocuments(projectId: string) {
  const supabase = await createServerActionClient();
  return fetchAllPages<{ id: string; file_name: string; classified_tags: unknown; storage_path: string }>((from, to) =>
    supabase
      .from("source_documents")
      .select("id, file_name, classified_tags, storage_path")
      .eq("project_id", projectId)
      .order("id")
      .range(from, to)
  );
}
