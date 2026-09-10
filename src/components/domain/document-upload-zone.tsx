"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerUploadedDocument } from "@/actions/documents";
import { errorMessage } from "@/lib/error-message";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

type QueueItem = { file: File; status: "pending" | "uploading" | "done" | "error"; error?: string };

// direct_storage_upload.md：ファイル本体をServer Actionの引数として送らず、ブラウザから
// 直接Supabase Storageへアップロードし、Server Actionにはstorage_pathのみを渡す。
// Next.js Server ActionのボディサイズDefault上限（1MB）・Vercelサーバーレス関数の
// ペイロード上限（約4.5MB）が、大きめのPDF/PowerPointファイルで413エラーの原因になっていたため。
// storagePathの組み立ては規約35（日本語ファイル名をStorageキーに含めない）を踏襲する。
async function uploadOneFile(projectId: string, file: File) {
  const supabase = createClient();
  const safeExtension = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  const storagePath = `${projectId}/uploads/${crypto.randomUUID()}${safeExtension}`;

  const { error: uploadError } = await supabase.storage.from("project-documents").upload(storagePath, file);
  if (uploadError) throw uploadError;

  await registerUploadedDocument(projectId, storagePath, file.name);
}

export function DocumentUploadZone({ projectId }: { projectId: string }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function addFiles(files: FileList | File[]) {
    const items = Array.from(files).map((file) => ({ file, status: "pending" as const }));
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
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].status !== "pending") continue;
        setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item)));

        // uploadOneFile・registerUploadedDocumentはどちらも成功時に値を返さず失敗時にthrowする
        // 通常の非同期関数（useActionStateパターンではない）。onClick+startTransition経由の
        // 呼び出しなのでerror.tsxには届かず、ここで明示的にtry/catchする（規約44）。
        try {
          await uploadOneFile(projectId, queue[i].file);
          setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "done" } : item)));
          successCount++;
        } catch (e) {
          const message = errorMessage(e);
          setQueue((q) =>
            q.map((item, idx) => (idx === i ? { ...item, status: "error", error: message } : item))
          );
          errorCount++;
        }
      }
      show(
        `${successCount}件アップロード完了${errorCount > 0 ? `（失敗${errorCount}件）` : ""}`,
        errorCount > 0 ? "error" : "success"
      );
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
        <p className="text-xs text-faint mt-1">PDF・Word・Excel・PowerPoint・画像・テキストに対応</p>
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
                    : "text-faint"
                }
                title={item.error}
              >
                {item.status === "pending" && "待機中"}
                {item.status === "uploading" && "アップロード中"}
                {item.status === "done" && "完了"}
                {item.status === "error" && "失敗"}
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
