# 指示書：案件トップへの導線追加・テーブルの並び替え機能

## 目的

1. 案件内のどのページからでも、案件トップ画面（概要・次の作業）に戻れるようにする
2. `RequirementTable`（AI素案生成結果を含む一覧）で、列またはステータスによる並び替えができるようにする

## 前提確認

- 画面導線の再整備（章ステータス表示・全体進捗バー・パンくず）が完了していること

---

## Step 1: サイドバーに案件トップへの導線を追加

`src/app/projects/[id]/layout.tsx`を修正する。現状、案件名がただのテキスト表示になっている箇所をリンク化し、あわせて明示的な「概要」リンクも追加する（案件名がクリックできることに気づかないユーザーへの配慮）。

```tsx
// 修正前: <div className="text-sm font-semibold text-primary mb-4 truncate">{project?.name}</div>
// 修正後:
<Link href={`/projects/${id}`} className="text-sm font-semibold text-primary mb-1 truncate block hover:underline">
  {project?.name}
</Link>
<Link href={`/projects/${id}`} className="text-xs text-secondary hover:text-primary mb-4 block">
  ← 案件トップに戻る
</Link>
```

**注意**：全体進捗バー（前回のStepで案件名の下に追加済み）との配置順序を確認し、自然な並びになるよう調整すること（案件名 → トップに戻るリンク → 進捗バー、の順を想定しているが、見た目のバランスはお任せする）。

## Step 2: RequirementTableに並び替え機能を追加

`src/components/domain/requirement-table/RequirementTable.tsx`を修正する。

```tsx
import { useMemo, useState, useTransition } from "react";
// ...既存のimportに追加

// コンポーネント内、既存のstate定義に追加
const [sortKey, setSortKey] = useState<string | null>(null);
const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

const sortedItems = useMemo(() => {
  if (!sortKey) return items;
  const copy = [...items];
  copy.sort((a, b) => {
    const av = sortKey === "__status__" ? a.status : (a.content[sortKey] ?? "");
    const bv = sortKey === "__status__" ? b.status : (b.content[sortKey] ?? "");
    const cmp = String(av).localeCompare(String(bv), "ja");
    return sortDir === "asc" ? cmp : -cmp;
  });
  return copy;
}, [items, sortKey, sortDir]);

function toggleSort(key: string) {
  if (sortKey === key) {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  } else {
    setSortKey(key);
    setSortDir("asc");
  }
}
```

ヘッダー行（列名を表示している箇所）をクリック可能なボタンに変更する。

```tsx
{columns.map((c) => (
  <button
    key={c.column_key}
    onClick={() => toggleSort(c.column_key)}
    className="px-3 py-2 text-left hover:text-primary flex items-center gap-1"
  >
    {c.label}
    {sortKey === c.column_key && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
  </button>
))}
<button onClick={() => toggleSort("__status__")} className="px-3 py-2 text-left hover:text-primary flex items-center gap-1">
  ステータス
  {sortKey === "__status__" && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
</button>
```

データ行のレンダリング元を、既存の`items.map(...)`から`sortedItems.map(...)`に変更する。

**注意**：ヘッダーが元々`<div>`だった場合、`<button>`に変更するとブラウザのデフォルトボタンスタイル（枠線・背景）が付くことがある。`appearance-none`や`bg-transparent border-none`等で打ち消すか、`<div onClick=...>`のまま`role="button"`を付与する形でもよい（キーボード操作の考慮が必要な場合は`<button>`の方が望ましいが、見た目の調整はお任せする）。

## Step 3: 動作確認

1. いずれかの案件詳細ページ（例：章ページ、業務フロー等）から、サイドバーの案件名または「← 案件トップに戻る」をクリックし、`/projects/{id}`に遷移することを確認する
2. AI素案生成で複数項目が作成された章で、いずれかの列見出しをクリックし、その列の内容（例：名称の五十音順）で並び替わることを確認する
3. 同じ列見出しを再度クリックし、昇順⇔降順が切り替わることを確認する
4. 「ステータス」見出しをクリックし、ステータスで並び替わることを確認する
5. 並び替え後も、既存の操作（確定・例外承認・削除・Salesforce機能提案等）が正しい項目に対して実行されることを確認する（並び替えで表示順が変わっても、各行の項目IDとの紐付けが崩れないこと）

## やってはいけないこと

- 並び替えの状態をサーバー側に保存しない（画面をリロードすればリセットされる、ページ内限定の軽量な機能にとどめる）
- 並び替えによって、確定済み項目の編集不可等の既存のステータス依存ロジックに影響を与えない（表示順序のみを変更し、データやロジックには触れない）

## 完了条件

- [ ] サイドバーから案件トップへの導線が機能することを確認済み
- [ ] `RequirementTable`の列・ステータスによる並び替えが動作確認済み
- [ ] 並び替え後も既存の行単位の操作が正しく機能することを確認済み
