"use server";

import { safeAction, type ActionResult } from "@/lib/action-result";
import { createServerActionClient } from "@/lib/supabase/server";
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
export async function checkDuplicateDocument(projectId: string, fileName: string, fileSize: number): Promise<ActionResult<boolean>> {
  return safeAction("checkDuplicateDocument", () => checkDuplicateDocumentInner(projectId, fileName, fileSize));
}

async function checkDuplicateDocumentInner(projectId: string, fileName: string, fileSize: number): Promise<boolean> {
  const supabase = await createServerActionClient();
  return isDuplicateDocument(supabase, projectId, fileName, fileSize);
}

export type RegisterResult = "done" | "skipped" | "classification_failed";

export async function registerUploadedDocument(projectId: string, storagePath: string, fileName: string): Promise<ActionResult<RegisterResult>> {
  return safeAction("registerUploadedDocument", () => registerUploadedDocumentInner(projectId, storagePath, fileName));
}

// 登録に失敗した（または重複で登録しない）ときに、アップロード済みのファイルをStorageから消す。
// クライアントが渡すstoragePathを信用せず、サーバー側で次を確かめる（規約66）：
//   ・パスが{projectId}/uploads/で始まること
//   ・このパスを参照するsource_documentsの行が存在しないこと（登録済みの資料のファイルは消さない）
// 削除は利用者自身のクライアントで行う。RLS（project_documents_delete_unregistered_by_member）も
// 「案件メンバー・uploads配下・未登録のファイル」だけを許す。ここでの失敗は、元のエラーを優先して記録のみ。
async function removeUnregisteredUpload(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  projectId: string,
  storagePath: string
): Promise<void> {
  try {
    if (!storagePath.startsWith(`${projectId}/uploads/`) || storagePath.includes("..")) return;
    const { count, error: countError } = await supabase
      .from("source_documents")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", storagePath);
    if (countError || (count ?? 0) > 0) return;
    const { error } = await supabase.storage.from("project-documents").remove([storagePath]);
    if (error) console.error("[registerUploadedDocument] 未登録ファイルの削除に失敗:", error.message);
  } catch (e) {
    console.error("[registerUploadedDocument] 未登録ファイルの削除に失敗:", e);
  }
}

async function registerUploadedDocumentInner(projectId: string, storagePath: string, fileName: string): Promise<RegisterResult> {
  const supabase = await createServerActionClient();
  try {
    return await registerCore(supabase, projectId, storagePath, fileName);
  } catch (e) {
    // 登録に失敗したら、アップロード済みのファイルを必ず消す（画面から見えず、消せないファイルを残さない）
    await removeUnregisteredUpload(supabase, projectId, storagePath);
    throw e;
  }
}

async function registerCore(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  projectId: string,
  storagePath: string,
  fileName: string
): Promise<RegisterResult> {
  if (!storagePath.startsWith(`${projectId}/uploads/`) || storagePath.includes("..")) {
    throw new UserFacingError("ファイルの場所が正しくありません");
  }
  // 既に登録済みのファイルを、別の資料として二重に登録させない（この場合、ファイルは消さない）
  const { count: already, error: alreadyError } = await supabase
    .from("source_documents")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", storagePath);
  if (alreadyError) throw new UserFacingError(errorMessage(alreadyError));
  if ((already ?? 0) > 0) throw new UserFacingError("このファイルは既に登録されています");

  const { data: file, error: downloadError } = await supabase.storage.from("project-documents").download(storagePath);
  if (downloadError || !file) {
    throw new UserFacingError(downloadError ? errorMessage(downloadError) : "アップロードしたファイルの取得に失敗しました");
  }

  // アップロード前の確認をすり抜けた重複（同時アップロード等）は、ここで登録せず、送られたファイルも消す
  if (await isDuplicateDocument(supabase, projectId, fileName, file.size)) {
    await removeUnregisteredUpload(supabase, projectId, storagePath);
    return "skipped";
  }

  // AI分類（利用枠の超過・キー無効など）に失敗しても、未分類（タグ空・classification_failed）として登録する。
  // あとで資料一覧から再分類できる。分類以外の失敗（DB・権限など）は登録しない。
  let tags: string[] = [];
  let classificationFailed = false;
  try {
    tags = (await classifyDocument(file, fileName)).tags;
  } catch (e) {
    classificationFailed = true;
    console.error("[registerUploadedDocument] 分類に失敗したため、未分類で登録します:", e instanceof Error ? e.message : e);
  }

  const { error: insertError } = await supabase.from("source_documents").insert({
    project_id: projectId,
    file_name: fileName,
    file_size: file.size,
    storage_path: storagePath,
    classified_tags: tags,
    classification_failed: classificationFailed,
  });
  if (insertError) throw new UserFacingError(errorMessage(insertError));

  revalidatePath(`/projects/${projectId}/documents`);
  return classificationFailed ? "classification_failed" : "done";
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

  const { data: affected1, error: updateError } = await supabase
    .from("source_documents")
    .update({ classified_tags: classification.tags, classification_failed: false, updated_at: new Date().toISOString() })
    .eq("id", documentId).select("id");
  if (updateError) throw updateError;
  if (!affected1 || affected1.length === 0) throw new UserFacingError("対象が見つかりません");

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
  return fetchAllPages<{ id: string; file_name: string; classified_tags: unknown; storage_path: string; classification_failed: boolean }>((from, to) =>
    supabase
      .from("source_documents")
      .select("id, file_name, classified_tags, storage_path, classification_failed")
      .eq("project_id", projectId)
      .order("id")
      .range(from, to)
  );
}

// 分類されていない資料（タグが空、または分類に失敗）の数。AI素案の生成は分類タグで資料を選ぶため、
// これらは再分類するまで生成に使われない（資料一覧・一括生成ページに案内を出す）。
export async function countUnclassifiedDocuments(projectId: string): Promise<number> {
  const docs = await listDocuments(projectId);
  return docs.filter((d) => d.classification_failed || !Array.isArray(d.classified_tags) || d.classified_tags.length === 0).length;
}
