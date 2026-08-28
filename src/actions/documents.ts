"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { classifyDocument } from "@/lib/ai/classify-document";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { revalidatePath } from "next/cache";

async function uploadDocumentInternal(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const file = formData.get("file") as File;
  if (!file) throw new UserFacingError("ファイルが選択されていません");

  const safeExtension = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  const storagePath = `${projectId}/uploads/${crypto.randomUUID()}${safeExtension}`;

  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, file);
  if (uploadError) throw uploadError;

  const excerpt = await extractExcerpt(file, file.name);
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

// classifyDocument経由でGeminiを呼ぶため、AiCallErrorをthrowせず戻り値で返す
// （error.tsxがServer Action由来のメッセージを表示できないため。ai-draft.ts参照）。
export async function uploadDocument(
  projectId: string,
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    await uploadDocumentInternal(projectId, formData);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
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

  const excerpt = await extractExcerpt(file, doc.file_name);
  const classification = await classifyDocument(excerpt);

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

// テキスト系ファイルのみ簡易対応。PDF/画像等の本格対応はPhase1後半で拡張する
// 拡張子で判定する（Storageからdownload()したBlobはfile.typeを持たない・name自体を持たないため、
// アップロード時のFileと再分類時のBlobの両方から同じロジックで呼べるようにfileNameを別で受け取る）
async function extractExcerpt(file: Blob, fileName: string): Promise<string> {
  if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return await file.text();
  }
  return `[ファイル名からの推測: ${fileName}]`;
}
