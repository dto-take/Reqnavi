# 指示書：ナレッジから資料への直接リンク・時刻表示の追加

## 目的

1. 「ナレッジ」の各項目から、根拠となった資料ファイルを直接開けるようにする（署名付きURLを発行）
2. ナレッジの日時表示を、日付のみから日付+時刻に変更する

## 前提確認

- ナレッジ項目のリンク化（章ページへの遷移）が完了していること

---

## Step 1: getRecentKnowledgeで出典資料の署名付きURLを取得

`src/actions/project-overview.ts`の`getRecentKnowledge`を修正する。

```ts
export type KnowledgeItem = {
  chapterNo: number;
  summary: string;
  status: string;
  updatedAt: string;
  sourceFileName: string | null;
  sourceUrl: string | null;
};

export async function getRecentKnowledge(projectId: string): Promise<KnowledgeItem[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, content, status, updated_at")
    .eq("project_id", projectId)
    .in("status", ["confirmed", "exception_approved"])
    .order("updated_at", { ascending: false })
    .limit(6);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: sourceLinks } = await supabase
    .from("item_sources")
    .select("item_id, source_documents(file_name, storage_path)")
    .in("item_id", data.map((i) => i.id));

  const sourceByItem = new Map<string, { file_name: string; storage_path: string }>();
  for (const link of sourceLinks ?? []) {
    const doc = link.source_documents as unknown as { file_name: string; storage_path: string } | null;
    if (doc && !sourceByItem.has(link.item_id)) {
      sourceByItem.set(link.item_id, doc);
    }
  }

  const result: KnowledgeItem[] = [];
  for (const item of data) {
    const doc = sourceByItem.get(item.id);
    let sourceUrl: string | null = null;
    if (doc) {
      const { data: signed } = await supabase.storage
        .from("project-documents")
        .createSignedUrl(doc.storage_path, 300);
      sourceUrl = signed?.signedUrl ?? null;
    }

    result.push({
      chapterNo: item.chapter_no,
      summary: item.content?.name ?? item.content?.detail ?? item.content?.issue ?? item.content?.why ?? "(内容なし)",
      status: item.status,
      updatedAt: item.updated_at,
      sourceFileName: doc?.file_name ?? null,
      sourceUrl,
    });
  }
  return result;
}
```

**注意**：署名付きURLの有効期限は5分としている。ページ表示から時間が経ってクリックすると期限切れでエラーになる可能性があるが、このStepでは簡潔さを優先し、期限切れ時の自動再取得等は対応しない（クリック失敗時は画面を再読み込みしてもらう運用とする）。

## Step 2: ナレッジ一覧UIに資料リンク・時刻表示を追加

`src/app/projects/[id]/page.tsx`のナレッジ一覧部分を修正する。

```tsx
<Link
  key={i}
  href={`/projects/${id}/chapters/${k.chapterNo}`}
  className="border-t border-hover pt-2 first:border-t-0 first:pt-0 block hover:bg-hover rounded px-1 -mx-1"
>
  <div className="flex justify-between items-center mb-1">
    <span className="text-[11px] text-faint">{k.chapterNo}. {CHAPTER_NAMES[k.chapterNo]}</span>
    <span className="text-[11px] text-faint">
      {new Date(k.updatedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
    </span>
  </div>
  <p className="text-sm text-primary mb-1">{k.summary}</p>
  {k.sourceUrl && (
    <a
      href={k.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-[11px] text-secondary underline"
    >
      📄 {k.sourceFileName}
    </a>
  )}
</Link>
```

**注意**：資料リンク（`<a>`）は親の`<Link>`（章ページへの遷移）の内側に入れ子になるため、資料リンクをクリックした際に親のリンク遷移が同時に発生しないよう`e.stopPropagation()`を入れている。`target="_blank"`との組み合わせで意図通り動作するか、動作確認時に必ず確認すること。

## Step 3: 動作確認

1. 出典資料がある確定項目で、ナレッジ一覧に資料名のリンクが表示されることを確認する
2. 資料リンクをクリックすると、新しいタブでその資料ファイルが開くことを確認する
3. 資料リンクをクリックしたとき、同時に章ページへの遷移（親リンク）が発生しないことを確認する
4. 出典資料が無い項目では、資料リンクが表示されないことを確認する
5. 日時表示が「日付+時刻」の形式になっていることを確認する
6. 署名付きURLの有効期限（5分）が切れた状態でクリックした場合の挙動を確認する（エラーになること自体は許容するが、画面が壊れないことを確認する）

## やってはいけないこと

- 署名付きURLの生成に`service_role`クライアントを使わない（通常のクライアントで、ユーザー自身のRLS権限内で生成できるため不要）
- 資料が複数紐づく項目で、無理に全件のリンクを表示しようとしない（最初の1件のみで十分とする。指示書のロジックも1件のみ取得する設計にしている）

## 完了条件

- [ ] 出典資料への署名付きURLリンク実装済み
- [ ] 日時表示（時刻込み）実装済み
- [ ] 動作確認済み
