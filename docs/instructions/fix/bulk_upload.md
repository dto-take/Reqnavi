# 指示書：資料の一括アップロード（ドラッグ&ドロップ対応）

## 目的

資料アップロード画面を、単一ファイルの`<input>`+ボタンから、複数ファイルのドラッグ&ドロップ・選択に対応させる。各ファイルは既存の`uploadDocument`（分類処理込み）を順次呼び出す形とし、AI呼び出しの並列殺到（Geminiのレート制限）を避ける。

## 前提確認

- バグ修正・小規模UX改善5点が完了していること

---

## Step 1: アップロード用クライアントコンポーネントを作成

新規ファイル `src/components/domain/document-upload-zone.tsx`。

```tsx
"use client";

import { useState, useTransition } from "react";
import { uploadDocument } from "@/actions/documents";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/error-message";

type QueueItem = { file: File; status: "pending" | "uploading" | "done" | "error"; error?: string };

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
        try {
          const formData = new FormData();
          formData.append("file", queue[i].file);
          await uploadDocument(projectId, formData);
          setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "done" } : item)));
          successCount++;
        } catch (e) {
          setQueue((q) =>
            q.map((item, idx) => (idx === i ? { ...item, status: "error", error: errorMessage(e) } : item))
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
```

**注意**：ファイルは1件ずつ順番に`uploadDocument`を呼び出している（`Promise.all`等での並列実行はしない）。各アップロードには分類のためのGemini呼び出しが含まれており、並列にするとレート制限に達しやすくなるため、意図的に逐次処理にしている。

## Step 2: 資料アップロード画面を置き換え

`src/app/projects/[id]/documents/page.tsx`の、既存の単一ファイル用`<form action={uploadWithId}>`部分を、`DocumentUploadZone`に置き換える。

```tsx
import { DocumentUploadZone } from "@/components/domain/document-upload-zone";

<DocumentUploadZone projectId={id} />
```

**注意**：既存の`uploadDocument` Server Action自体は変更不要（1ファイルずつ呼び出す前提のシグネチャのまま使える）。

## Step 3: 動作確認

1. 3〜4ファイル（複数形式を混ぜる：PDF・Excel・テキスト等）をドラッグ&ドロップでまとめて選択し、キューに表示されることを確認する
2. 「N件をアップロード」ボタンを押し、1件ずつ「アップロード中」→「完了」に変わっていくことを確認する
3. 全件完了後、トースト通知で完了件数が表示されることを確認する
4. 資料一覧（既存の表示部分）に、アップロードした全ファイルが反映されることを確認する
5. あえて対応外の形式（例：.zip）を混ぜてアップロードし、その1件だけ「失敗」表示になり、他のファイルは正常に完了することを確認する
6. 「ファイルを選択」（ドラッグ&ドロップを使わない方法）でも複数ファイルを選択できることを確認する

## やってはいけないこと

- 複数ファイルのアップロードを並列実行（`Promise.all`等）にしない。Gemini呼び出しのレート制限を考慮し、逐次処理を維持する
- アップロード中にキューの表示が消えたり、進捗が分からなくなったりする実装にしない

## 完了条件

- [ ] `DocumentUploadZone`実装済み
- [ ] ドラッグ&ドロップ・複数選択の両方に対応済み
- [ ] 逐次アップロード・進捗表示・完了通知が動作確認済み
