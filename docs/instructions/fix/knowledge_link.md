# 指示書：ナレッジ項目をクリック可能にする

## 目的

案件トップ画面の「ナレッジ（最近確定した項目）」の各行を、該当する章のページへのリンクにする。

## 前提確認

- 「次にやるべきこと」表示の修正が完了していること

---

## Step 1: ナレッジ一覧の各行をリンク化

`src/app/projects/[id]/page.tsx`の、ナレッジ一覧を表示している箇所を修正する。

```tsx
import Link from "next/link";
// ...

<div className="flex flex-col gap-2">
  {knowledge.map((k, i) => (
    <Link
      key={i}
      href={`/projects/${id}/chapters/${k.chapterNo}`}
      className="border-t border-hover pt-2 first:border-t-0 first:pt-0 block hover:bg-hover rounded px-1 -mx-1"
    >
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-faint">{k.chapterNo}. {CHAPTER_NAMES[k.chapterNo]}</span>
        <span className="text-[11px] text-faint">{new Date(k.updatedAt).toLocaleDateString("ja-JP")}</span>
      </div>
      <p className="text-sm text-primary">{k.summary}</p>
    </Link>
  ))}
</div>
```

**注意**：4章（KPI）・10章（非機能要件）・15章（進捗）は固定ルート（`/chapters/4`等）だが、`href`の形式は既存の章ページ遷移と同じ`/projects/${id}/chapters/${k.chapterNo}`のままで、CLAUDE.md規約19（静的ルート優先）により正しく専用ページに到達する。

## Step 2: 動作確認

1. 案件トップ画面の「ナレッジ」の項目をクリックし、対応する章のページに遷移することを確認する
2. クリック可能であることが視覚的に分かる（ホバー時に背景色が変わる等）ことを確認する
3. 既存のレイアウト（区切り線・余白）が崩れていないことを確認する

## 完了条件

- [ ] ナレッジ項目がリンク化されていることを確認済み
