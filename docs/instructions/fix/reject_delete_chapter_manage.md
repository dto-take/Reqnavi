# 指示書：不要な章の削除・「不採用」ステータス・行削除

## 目的

1. 案件設定画面から、不要になった章を対象から外せるようにする（データは削除せず、表示対象から除外する非破壊的な方式）
2. 要件項目のステータスに「不採用」を追加し、AI素案等を明示的に却下できるようにする
3. 要件項目そのものを削除できるようにする

## 重要な設計判断：ロック状態の一元管理

これまで「確定済み項目は編集不可」というガードを複数箇所（content入力欄・確定ボタン・Salesforce機能提案ボタン等）に個別に実装しており、過去に1箇所の適用漏れが発生している（規約33）。今回「不採用」ステータスを追加するにあたり、同じ問題が再発しないよう、**「ロック状態か」を判定する共通関数を1箇所に定義し、全ての箇所でそれを参照する**形に変更する。

## 前提確認

- ナレッジから資料への直接リンク・時刻表示が完了していること

---

## Step 1: ロック状態判定の共通関数を作成

新規ファイル `src/lib/item-lock.ts`（通常モジュール）。

```ts
export type RequirementStatus = "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved" | "rejected";

const LOCKED_STATUSES: RequirementStatus[] = ["confirmed", "exception_approved", "rejected"];

export function isItemLocked(status: string): boolean {
  return LOCKED_STATUSES.includes(status as RequirementStatus);
}
```

`src/components/domain/requirement-table/RequirementTable.tsx`内、これまで`item.status === "confirmed" || item.status === "exception_approved"`のように個別判定していた箇所（content入力欄のdisabled、確定ボタンの表示条件、Salesforce機能提案ボタンの表示条件等）を、`grep -rn 'status === "confirmed"' src/components/domain/requirement-table`で全て洗い出し、`isItemLocked(item.status)`を使う形に統一する。

## Step 2: 「不採用」ステータスのStatusBadge・Server Actionを追加

`src/components/ui/status-badge.tsx`に追加する。

```ts
const STATUS_MAP: Record<Status, { label: string; bg: string; text: string }> = {
  // ...既存のエントリ
  rejected: { label: "不採用", bg: "var(--status-draft-bg)", text: "var(--text-faint)" },
};
```

`src/actions/requirement-items.ts`に追加する。

```ts
export async function markAsRejected(itemId: string, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "rejected" })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

export async function deleteRequirementItem(itemId: string, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from("requirement_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

## Step 3: RequirementTableに「不採用にする」「削除」ボタンを追加

`isItemLocked(item.status)`が`false`の項目（＝まだ確定・例外承認・不採用のいずれでもない項目）にのみ「不採用にする」ボタンを表示する。

```tsx
{!isItemLocked(item.status) && (
  <button
    disabled={isPending}
    onClick={() => startTransition(() => markAsRejected(item.id, projectId, chapterNo))}
    className="text-xs text-faint underline"
  >
    不採用にする
  </button>
)}
<button
  disabled={isPending}
  onClick={() => {
    if (confirm("この項目を削除しますか？この操作は取り消せません。")) {
      startTransition(() => deleteRequirementItem(item.id, projectId, chapterNo));
    }
  }}
  className="text-xs text-[#A23B2E] underline"
>
  削除
</button>
```

**注意**：`RequirementTable`はテーブル全体が個別のonClickベースの実装のため、既存の`ConfirmDeleteButton`（`<form>`＋`useFormStatus`前提）はこの文脈では使わず、上記のように直接`confirm()`→`startTransition`を呼ぶ形にしている。「削除」ボタンは、ロック状態に関わらず常に表示してよい（確定済み項目の削除も、確認ダイアログを経て許可する）。

## Step 4: 集計ロジックから「不採用」項目を除外

`src/actions/readiness.ts`の`getReadinessSummary`で、`rejected`ステータスの項目を集計対象から除外する（充足率・要ヒアリング件数の計算に含めない）。

```ts
const activeItems = items?.filter((i) => i.status !== "rejected") ?? [];
// 以降の totalItems・confirmedItems・needHearingCount の計算を activeItems ベースに変更
```

`src/actions/consistency.ts`の`checkOrphanItems`でも同様に、`rejected`項目を孤立要件チェックの対象から除外する。

## Step 5: 案件設定画面に対象章の管理を追加

`src/actions/project-settings.ts`に追加する。

```ts
export async function updateSelectedChapters(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new Error("PM以上の権限が必要です");
  }

  const selectedChapters = formData.getAll("chapters").map(Number);
  const { error } = await supabase
    .from("projects")
    .update({ selected_chapters: selectedChapters })
    .eq("id", projectId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}`);
}
```

`src/app/projects/[id]/settings/page.tsx`に、章のチェックボックス一覧を追加する。

```tsx
import { CHAPTER_NAMES } from "@/lib/chapters";
import { updateSelectedChapters } from "@/actions/project-settings";

<Card className="mt-4">
  <h2 className="text-sm font-semibold text-primary mb-1">対象章の管理</h2>
  <p className="text-xs text-secondary mb-3">
    チェックを外した章はサイドバー・各種集計から除外されます（データ自体は削除されません。再度チェックすれば復元されます）。
  </p>
  <form action={updateSelectedChapters.bind(null, id)} className="flex flex-col gap-2">
    <div className="flex flex-wrap gap-2">
      {Object.entries(CHAPTER_NAMES).map(([n, name]) => (
        <label key={n} className="text-xs px-2 py-1 rounded bg-hover text-primary flex items-center gap-1">
          <input type="checkbox" name="chapters" value={n} defaultChecked={project?.selected_chapters?.includes(Number(n))} />
          {n}.{name}
        </label>
      ))}
    </div>
    <SubmitButton size="sm" pendingText="更新中...">更新</SubmitButton>
  </form>
</Card>
```

**注意**：章のチェックを外しても、その章の`requirement_items`は削除しない（非破壊的）。この画面から章データそのものを完全削除する機能は、今回のスコープに含めない。

## Step 6: 動作確認

1. いずれかの項目で「不採用にする」を押し、ステータスバッジが「不採用」（グレー）に変わることを確認する
2. 不採用にした項目のcontent入力欄が編集不可になり、Salesforce機能提案ボタンも表示されなくなることを確認する（`isItemLocked`が正しく機能しているか）
3. 確定判定ダッシュボードで、不採用項目が充足率・要ヒアリング件数の計算から除外されていることを確認する
4. 整合性チェックで、不採用項目が孤立要件の対象から除外されていることを確認する
5. 項目の「削除」を押し、確認ダイアログが出て、確定後に実際に削除されることを確認する
6. 案件設定で、いずれかの章のチェックを外して更新し、サイドバー・案件トップからその章が消えることを確認する
7. 同じ章を再度チェックして更新し、以前のデータ（削除していない項目）がそのまま復元されることを確認する

## やってはいけないこと

- 章のチェックを外した際に、`requirement_items`を実際に削除しない（非破壊的な仕組みを維持する）
- 「不採用」ステータスの項目を、既存の「確定済み項目は編集不可」ロジックの対象から漏らさない（`isItemLocked`を必ず経由させる）

## 完了条件

- [ ] `isItemLocked`共通関数実装済み、既存箇所すべてがこれを参照するよう統一済み
- [ ] 「不採用にする」「削除」機能実装済み
- [ ] 集計ロジック（充足率・整合性チェック）から不採用項目が除外されることを確認済み
- [ ] 案件設定での対象章の管理（非破壊的）が動作確認済み
