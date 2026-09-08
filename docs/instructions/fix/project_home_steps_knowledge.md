# 指示書：案件トップ画面の拡充（ステップ表現・ナレッジ集約）

## 目的

参考UI（WHITEBOX）の以下2点を取り入れ、案件トップ画面を拡充する。

1. 15章をグループ分けし、チェックマーク付きのステップリストとして表示する
2. 最近確定した項目を「ナレッジ」として一覧表示し、何が決まってきているかを俯瞰できるようにする

## 前提確認

- 出典・確度の可視化、ステップナビゲーション、KPI説明文が完了していること

---

## Step 1: 章のグループ分けを定義

`src/lib/chapters.ts`に追加する。

```ts
export const CHAPTER_GROUPS: { label: string; chapters: number[] }[] = [
  { label: "基本情報", chapters: [1, 2, 3, 4] },
  { label: "要件定義", chapters: [5, 6, 7, 8, 9, 10, 11] },
  { label: "運用・定着", chapters: [12, 13, 14] },
  { label: "進捗管理", chapters: [15] },
];
```

## Step 2: ステップリスト用のデータ取得

`src/actions/project-overview.ts`の`getProjectOverview`が返す`readiness`（A/B/C章）・`simpleStatuses`（D/E/ガント章、`getSimpleChapterStatuses`）を組み合わせ、章ごとのステータスをまとめて返すよう修正する。

```ts
import { chapterStatusFromReadiness, getSimpleChapterStatuses } from "@/actions/readiness";

// getProjectOverview内、既存のreadiness取得に続けて
const simpleStatuses = await getSimpleChapterStatuses(projectId);

const chapterStatusMap: Record<number, "not_started" | "in_progress" | "confirmed"> = {};
for (const r of readiness) {
  chapterStatusMap[r.chapterNo] = chapterStatusFromReadiness(r);
}
for (const [chapterNo, status] of Object.entries(simpleStatuses)) {
  chapterStatusMap[Number(chapterNo)] = status;
}
```

`getProjectOverview`の戻り値に`chapterStatusMap`を追加する。

## Step 3: 最近確定した項目（ナレッジ）を取得

`src/actions/project-overview.ts`に追加する。

```ts
export type KnowledgeItem = {
  chapterNo: number;
  summary: string;
  status: string;
  updatedAt: string;
};

export async function getRecentKnowledge(projectId: string): Promise<KnowledgeItem[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("requirement_items")
    .select("chapter_no, content, status, updated_at")
    .eq("project_id", projectId)
    .in("status", ["confirmed", "exception_approved"])
    .order("updated_at", { ascending: false })
    .limit(6);
  if (error) throw error;

  return (data ?? []).map((item) => ({
    chapterNo: item.chapter_no,
    summary: item.content?.name ?? item.content?.detail ?? item.content?.issue ?? item.content?.why ?? "(内容なし)",
    status: item.status,
    updatedAt: item.updated_at,
  }));
}
```

**注意**：`content`のキー構成はテンプレート（A〜E）によって異なるため、代表的な列（`name`・`detail`・`issue`・`why`）を優先順位付きで拾う簡易実装にしている。テンプレートDやEの項目はこの一覧に含まれにくい（`content`の構造が異なるため）が、このStepでは対象を主にテンプレートA/B/Cに絞ってよい。

## Step 4: 案件トップ画面にステップリスト・ナレッジを追加

`src/app/projects/[id]/page.tsx`を修正する。

```tsx
import { getProjectOverview, computeNextAction, getRecentKnowledge } from "@/actions/project-overview";
import { CHAPTER_GROUPS, CHAPTER_NAMES } from "@/lib/chapters";

// ページ内、既存のoverview取得に続けて
const knowledge = await getRecentKnowledge(id);
```

ステップリストのUI（概要カードとクイックリンクの間あたりに追加）。

```tsx
<Card>
  <h2 className="text-sm font-semibold text-primary mb-3">ステップ</h2>
  <div className="flex flex-col gap-4">
    {CHAPTER_GROUPS.map((group) => (
      <div key={group.label}>
        <div className="text-[11px] text-faint mb-1">{group.label}</div>
        <div className="flex flex-col gap-1">
          {group.chapters
            .filter((n) => overview.project?.selected_chapters?.includes(n))
            .map((n) => {
              const status = overview.chapterStatusMap[n] ?? "not_started";
              return (
                <Link key={n} href={`/projects/${id}/chapters/${n}`} className="flex items-center gap-2 text-sm hover:bg-hover rounded px-2 py-1">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                      status === "confirmed" ? "bg-brand text-white" : status === "in_progress" ? "border-2 border-[var(--status-review-text)]" : "border-2 border-border"
                    }`}
                  >
                    {status === "confirmed" ? "✓" : ""}
                  </span>
                  <span className={status === "not_started" ? "text-faint" : "text-primary"}>
                    {n}. {CHAPTER_NAMES[n]}
                  </span>
                </Link>
              );
            })}
        </div>
      </div>
    ))}
  </div>
</Card>
```

ナレッジ一覧のUI。

```tsx
<Card>
  <h2 className="text-sm font-semibold text-primary mb-3">ナレッジ（最近確定した項目）</h2>
  {knowledge.length === 0 ? (
    <p className="text-sm text-secondary">まだ確定した項目がありません</p>
  ) : (
    <div className="flex flex-col gap-2">
      {knowledge.map((k, i) => (
        <div key={i} className="border-t border-hover pt-2 first:border-t-0 first:pt-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-faint">{k.chapterNo}. {CHAPTER_NAMES[k.chapterNo]}</span>
            <span className="text-[11px] text-faint">{new Date(k.updatedAt).toLocaleDateString("ja-JP")}</span>
          </div>
          <p className="text-sm text-primary">{k.summary}</p>
        </div>
      ))}
    </div>
  )}
</Card>
```

## Step 5: 動作確認

1. 案件トップ画面に、4グループ（基本情報／要件定義／運用・定着／進捗管理）でステップリストが表示されることを確認する
2. 確定済みの章にチェックマークが、進行中の章に色付きの輪が、未着手の章に灰色の輪が表示されることを確認する
3. `selected_chapters`に含まれない章がステップリストに表示されないことを確認する
4. いずれかの項目を確定させた後、案件トップ画面の「ナレッジ」に、その項目が新しい順で表示されることを確認する
5. まだ何も確定していない案件で、「まだ確定した項目がありません」と表示されることを確認する

## やってはいけないこと

- ステップリストのグループ分け（`CHAPTER_GROUPS`）を、`chapter_column_templates`等の既存のテンプレート分類と混同しない（あくまで表示上のグルーピングであり、データモデルには影響しない）
- ナレッジ一覧のために新しいテーブル（活動ログ等）を作らない。既存の`requirement_items.updated_at`で代替する

## 完了条件

- [ ] 章のグループ分け定義済み
- [ ] ステップリストのステータス取得・表示実装済み
- [ ] ナレッジ（最近確定した項目）の取得・表示実装済み
- [ ] 動作確認済み
