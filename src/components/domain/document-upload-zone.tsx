"use client";

import { useState, useTransition } from "react";
import { uploadDocument } from "@/actions/documents";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { useGlobalPending } from "@/components/ui/loading-overlay";

type QueueItem = { file: File; status: "pending" | "uploading" | "done" | "error"; error?: string };

export function DocumentUploadZone({ projectId }: { projectId: string }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  useGlobalPending(isPending);
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

        const formData = new FormData();
        formData.append("file", queue[i].file);
        // uploadDocumentはuseActionState向けのシグネチャ（第2引数はprevState）で、
        // 失敗してもthrowせず{error: string}を返す設計（Server Action境界を越える際の
        // エラーメッセージ欠落を避けるため、documents.ts側で意図的にこうなっている）。
        // そのためtry/catchではなく戻り値のerrorを見て判定する。
        const result = await uploadDocument(projectId, { error: null }, formData);
        if (result.error) {
          setQueue((q) =>
            q.map((item, idx) => (idx === i ? { ...item, status: "error", error: result.error ?? undefined } : item))
          );
          errorCount++;
        } else {
          setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "done" } : item)));
          successCount++;
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
