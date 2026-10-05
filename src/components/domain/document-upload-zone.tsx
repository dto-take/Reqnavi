"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { checkDuplicateDocument, registerUploadedDocument } from "@/actions/documents";
import { errorMessage } from "@/lib/error-message";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

type QueueItem = { file: File; status: "pending" | "uploading" | "done" | "error" | "skipped"; error?: string };

// upload_size_limit.md：1ファイルあたり20MBを上限とする。Storage側のfile_size_limit
// （20260910041626_set_project_documents_size_limit.sqlマイグレーション）と合わせた
// 多重防御で、こちらはアップロード自体を試みる前に即座に弾くためのクライアント側チェック。
const MAX_FILE_SIZE = 20 * 1024 * 1024;
// documents.tsのDUPLICATE_DOCUMENT_MESSAGEと同じ文言（"use server"ファイルは定数をexportできないため複製）
const DUPLICATE_MESSAGE = "同じ名前・サイズの資料が既に登録されています";

// direct_storage_upload.md：ファイル本体をServer Actionの引数として送らず、ブラウザから
// 直接Supabase Storageへアップロードし、Server Actionにはstorage_pathのみを渡す。
// Next.js Server ActionのボディサイズDefault上限（1MB）・Vercelサーバーレス関数の
// ペイロード上限（約4.5MB）が、大きめのPDF/PowerPointファイルで413エラーの原因になっていたため。
// storagePathの組み立ては規約35（日本語ファイル名をStorageキーに含めない）を踏襲する。
// 戻り値：登録したら"done"、同じ名前・サイズの資料が既にあれば（Storageへ送らず）"skipped"
async function uploadOneFile(projectId: string, file: File): Promise<"done" | "skipped"> {
  if (await checkDuplicateDocument(projectId, file.name, file.size)) return "skipped";
  const supabase = createClient();
  const safeExtension = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  const storagePath = `${projectId}/uploads/${crypto.randomUUID()}${safeExtension}`;

  const { error: uploadError } = await supabase.storage.from("project-documents").upload(storagePath, file);
  if (uploadError) throw uploadError;

  return registerUploadedDocument(projectId, storagePath, file.name);
}

export function DocumentUploadZone({ projectId }: { projectId: string }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function addFiles(files: FileList | File[]) {
    const items = Array.from(files).map((file) => {
      if (file.size > MAX_FILE_SIZE) {
        return { file, status: "error" as const, error: "ファイルサイズが上限（20MB）を超えています" };
      }
      return { file, status: "pending" as const };
    });
    setQueue((q) => [...q, ...items]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function startUpload() {
    startTransition(async () => {
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].status !== "pending") continue;
        setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item)));

        // uploadOneFile・registerUploadedDocumentは、成功時にdone／skippedを返し、失敗時にthrowする
        // 通常の非同期関数（useActionStateパターンではない）。onClick+startTransition経由の
        // 呼び出しなのでerror.tsxには届かず、ここで明示的にtry/catchする（規約44）。
        try {
          const result = await uploadOneFile(projectId, queue[i].file);
          setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: result, error: result === "skipped" ? DUPLICATE_MESSAGE : undefined } : item)));
          if (result === "skipped") skippedCount++;
          else successCount++;
        } catch (e) {
          const message = errorMessage(e);
          setQueue((q) =>
            q.map((item, idx) => (idx === i ? { ...item, status: "error", error: message } : item))
          );
          errorCount++;
        }
      }
      const parts = [`${successCount}件アップロード完了`];
      if (skippedCount > 0) parts.push(`スキップ：${skippedCount}件（${DUPLICATE_MESSAGE}）`);
      if (errorCount > 0) parts.push(`失敗${errorCount}件`);
      show(parts.join("、"), errorCount > 0 ? "error" : "success");
    });
  }

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center text-sm transition-colors ${
          isDragging ? "border-brand bg-hover" : "border-border text-secondary"
        }`}
      >
        ここにファイルをドラッグ＆ドロップ、または
        <label className="text-brand underline cursor-pointer ml-1">
          ファイルを選択
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </label>
        <p className="text-xs text-faint mt-1">
          PDF・Word・Excel・PowerPoint・画像・テキストに対応（1ファイルあたり20MBまで）
        </p>
      </div>

      {queue.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {queue.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {item.status === "uploading" && <Spinner />}
              <span className="flex-1 truncate">{item.file.name}</span>
              <span
                className={
                  item.status === "error"
                    ? "text-[#A23B2E]"
                    : item.status === "done"
                    ? "text-brand"
                    : item.status === "skipped"
                    ? "text-secondary"
                    : "text-faint"
                }
                title={item.error}
              >
                {item.status === "pending" && "待機中"}
                {item.status === "uploading" && "アップロード中"}
                {item.status === "done" && "完了"}
                {item.status === "error" && "失敗"}
                {item.status === "skipped" && "スキップ（登録済み）"}
              </span>
            </div>
          ))}
          <button
            disabled={isPending || pendingCount === 0}
            onClick={startUpload}
            className="h-9 mt-2 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            {pendingCount > 0 ? `${pendingCount}件をアップロード` : "完了"}
          </button>
        </div>
      )}
    </div>
  );
}
