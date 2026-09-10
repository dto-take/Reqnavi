"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { classifyDocument } from "@/lib/ai/classify-document";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";

// ファイル本体はクライアントから直接Supabase Storageへアップロード済み（規約：
// Next.jsのServer Actionボディサイズ上限・Vercelサーバーレス関数のペイロード上限に
// 大きめのPDF/Word/PowerPointファイルが引っかかるため、direct_storage_upload.mdの方針で
// document-upload-zone.tsx側に移した）。このServer Actionはstorage_pathのみを受け取り、
// 分類・DB登録のみを担当する軽量な処理にする。
// 注意：storage_pathからのdownloadはBlobを返す（Fileではない）。classifyDocumentは
// 元々Blobを受け取る設計（reclassifyDocumentInternal参照）のため、不要なキャストはしない。
export async function registerUploadedDocument(projectId: string, storagePath: string, fileName: string) {
  const supabase = await createServerActionClient();

  const { data: file, error: downloadError } = await supabase.storage
    .from("project-documents")
    .download(storagePath);
  if (downloadError || !file) {
    throw new UserFacingError(downloadError ? errorMessage(downloadError) : "アップロードしたファイルの取得に失敗しました");
  }

  const classification = await classifyDocument(file, fileName);

  const { error: insertError } = await supabase.from("source_documents").insert({
    project_id: projectId,
    file_name: fileName,
    storage_path: storagePath,
    classified_tags: classification.tags,
  });
  if (insertError) throw new UserFacingError(errorMessage(insertError));

  revalidatePath(`/projects/${projectId}/documents`);
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
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, file_name, classified_tags, storage_path")
    .eq("project_id", projectId);
  if (error) throw error;
  return data;
}

export type RecentDocument = { id: string; fileName: string; updatedAt: string };

// 案件トップ画面の「最近更新された資料」用。資料の中身へのリンクは持たず、
// クリック先は一律で資料一覧（documents）画面とする。
export async function getRecentDocuments(projectId: string, limit = 5): Promise<RecentDocument[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, file_name, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as unknown as { id: string; file_name: string; updated_at: string }[]).map((d) => ({
    id: d.id,
    fileName: d.file_name,
    updatedAt: d.updated_at,
  }));
}
