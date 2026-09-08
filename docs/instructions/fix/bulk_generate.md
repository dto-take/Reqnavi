# 指示書：AI素案生成の一括実行（複数章選択）

## 目的

これまで章ごとに個別に実行していた「AI素案を生成」を、複数章をまとめて選択し、一括で実行できるようにする。資料の一括アップロード（前Step）と同じ「キュー管理・逐次実行」の考え方を踏襲する。

## スコープの限定

- 対象はテンプレートA/B/C（Flow1対応）を使う章のみとする。テンプレートD（KPI）・E（非機能要件）・ガントは、次のStep（10・11番）で個別に対応する
- 資料が無い章は、明確なエラーメッセージとともに失敗扱いとする（自動スキップの特別扱いはせず、既存の`generateDraft`のエラーメッセージをそのまま活かす）

## 前提確認

- 資料の一括アップロード（ドラッグ&ドロップ対応）が完了していること

---

## Step 1: 一括生成用のクライアントコンポーネントを作成

新規ファイル `src/components/domain/bulk-generate-zone.tsx`。

```tsx
"use client";

import { useState, useTransition } from "react";
import { generateDraft } from "@/actions/ai-draft";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/error-message";

type ChapterOption = { chapterNo: number; chapterName: string; templateType: "A" | "B" | "C" };
type QueueStatus = "unselected" | "pending" | "generating" | "done" | "error";

export function BulkGenerateZone({
  projectId,
  chapters,
}: {
  projectId: string;
  chapters: ChapterOption[];
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(chapters.map((c) => c.chapterNo)));
  const [statuses, setStatuses] = useState<Record<number, { status: QueueStatus; error?: string }>>({});
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function toggle(chapterNo: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chapterNo)) next.delete(chapterNo);
      else next.add(chapterNo);
      return next;
    });
  }

  function startGeneration() {
    const targets = chapters.filter((c) => selected.has(c.chapterNo));
    setStatuses(Object.fromEntries(targets.map((c) => [c.chapterNo, { status: "pending" as const }])));

    startTransition(async () => {
      let successCount = 0;
      let errorCount = 0;
      for (const chapter of targets) {
        setStatuses((s) => ({ ...s, [chapter.chapterNo]: { status: "generating" } }));
        try {
          await generateDraft(projectId, /* tenantId */ "", chapter.chapterNo, chapter.templateType);
          setStatuses((s) => ({ ...s, [chapter.chapterNo]: { status: "done" } }));
          successCount++;
        } catch (e) {
          setStatuses((s) => ({ ...s, [chapter.chapterNo]: { status: "error", error: errorMessage(e) } }));
          errorCount++;
        }
      }
      show(
        `${successCount}章の素案生成が完了しました${errorCount > 0 ? `（失敗${errorCount}章）` : ""}`,
        errorCount > 0 ? "error" : "success"
      );
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-1 mb-4">
        {chapters.map((c) => {
          const status = statuses[c.chapterNo]?.status ?? "unselected";
          return (
            <label key={c.chapterNo} className="flex items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={selected.has(c.chapterNo)}
                onChange={() => toggle(c.chapterNo)}
                disabled={isPending}
              />
              <span className="flex-1">{c.chapterNo}. {c.chapterName}</span>
              {status === "generating" && <Spinner />}
              {status === "done" && <span className="text-xs text-brand">完了</span>}
              {status === "error" && (
                <span className="text-xs text-[#A23B2E]" title={statuses[c.chapterNo]?.error}>
                  失敗
                </span>
              )}
            </label>
          );
        })}
      </div>
      <button
        disabled={isPending || selected.size === 0}
        onClick={startGeneration}
        className="h-9 px-4 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-50"
      >
        {isPending ? "生成中..." : `選択した${selected.size}章の素案を生成`}
      </button>
    </div>
  );
}
```

**注意（重要）**：`generateDraft`の実際の関数シグネチャ（引数の順序・`tenantId`の取得方法）を、`src/actions/ai-draft.ts`の現状の実装で必ず確認してから実装すること。指示書のサンプルは概形であり、`tenantId`をこのクライアントコンポーネントでどう取得するか（Server Componentから`getTenantId()`で取得しpropとして渡す等）は実装済みの他の箇所（`chapters/[chapterNo]/page.tsx`での呼び出し方）を参考にすること。

ファイルの一括アップロードと同様、**各章の生成は逐次実行**とし、並列実行はしない（Geminiのレート制限を考慮）。

## Step 2: 一括生成ページを作成

新規ファイル `src/app/projects/[id]/bulk-generate/page.tsx`。

```tsx
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { CHAPTER_NAMES, CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";
import { BulkGenerateZone } from "@/components/domain/bulk-generate-zone";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function BulkGeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerActionClient();
  const { data: project } = await supabase.from("projects").select("selected_chapters").eq("id", id).single();
  const selectedChapters = (project?.selected_chapters as number[]) ?? [];

  const chapters = selectedChapters
    .filter((n) => CHAPTER_TEMPLATE_MAP[n])
    .sort((a, b) => a - b)
    .map((n) => ({
      chapterNo: n,
      chapterName: CHAPTER_NAMES[n],
      templateType: CHAPTER_TEMPLATE_MAP[n] as "A" | "B" | "C",
    }));

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <PageHeader title="AI素案の一括生成" />
      <p className="text-xs text-secondary mb-4">
        テンプレートA/B/C（4章KPI・10章非機能要件・15章進捗は対象外）の章から選択し、まとめてAI素案を生成します。処理は1章ずつ順番に行われます。
      </p>
      <BulkGenerateZone projectId={id} chapters={chapters} />
    </Card>
  );
}
```

## Step 3: 導線を追加

`src/app/projects/[id]/layout.tsx`のサイドバー（「要件定義」セクション付近）に、一括生成ページへのリンクを追加する。

```tsx
<Link href={`/projects/${id}/bulk-generate`} className="text-xs text-secondary underline">
  AI素案を一括生成
</Link>
```

## Step 4: 動作確認

1. `/projects/{id}/bulk-generate` にアクセスし、テンプレートA/B/Cの章のみがチェックボックス一覧に表示されることを確認する（4・10・15章が含まれないこと）
2. 全章選択の状態で「選択したN章の素案を生成」を実行し、1章ずつ順番に「生成中」→「完了」に変わることを確認する
3. 一部の章のチェックを外した状態で実行し、選択した章のみが処理されることを確認する
4. 資料が無い章を選択して実行し、「失敗」表示になり、ホバーでエラー内容（資料が無い旨）が確認できることを確認する
5. 全処理完了後、成功・失敗件数を含むトースト通知が表示されることを確認する
6. 各章のページを開き、実際に素案が生成されていることを確認する

## やってはいけないこと

- 複数章の生成を並列実行しない（逐次実行を維持する）
- `generateDraft`の実際のシグネチャを確認せず、指示書のサンプルコードをそのまま信じて実装しない

## 完了条件

- [ ] `BulkGenerateZone`実装済み（実際の`generateDraft`シグネチャに合わせて調整済み）
- [ ] 一括生成ページ実装済み
- [ ] サイドバーからの導線追加済み
- [ ] 動作確認済み
