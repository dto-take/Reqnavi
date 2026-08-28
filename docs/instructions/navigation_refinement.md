# 指示書：画面導線の再整備（章ステータス表示・全体進捗バー・パンくず）

## 目的

`docs/01_requirements.md` §9.1で当初構想していたが保留にしていた「章ごとのステータス表示」「全体進捗バーの常時表示」を、Phase3で揃ったデータ（充足率）を使って実現する。あわせて、サイドバーの情報整理（グループ分け）と、深い階層のページへのパンくず導線を追加し、展開前の使い勝手を高める。

## 前提確認

- 案件トップ画面が完了していること

---

## Step 1: 章ごとのステータス判定ロジックを作成

新規ファイル `src/lib/chapter-status.ts`（通常モジュール）。

```ts
export type ChapterStatus = "not_started" | "in_progress" | "confirmed";

export function statusColor(status: ChapterStatus): { bg: string; text: string } {
  if (status === "confirmed") return { bg: "var(--status-confirmed-bg)", text: "var(--status-confirmed-text)" };
  if (status === "in_progress") return { bg: "var(--status-review-bg)", text: "var(--status-review-text)" };
  return { bg: "var(--status-draft-bg)", text: "var(--status-draft-text)" };
}
```

`src/actions/readiness.ts`に、A/B/C章向けのステータス判定を追加する。

```ts
export function chapterStatusFromReadiness(r: ChapterReadiness): "not_started" | "in_progress" | "confirmed" {
  if (r.totalItems === 0) return "not_started";
  if (r.readinessRate >= 100) return "confirmed";
  return "in_progress";
}
```

D（4章KPI）・E（10章非機能要件）・ガント（15章進捗）は`getReadinessSummary`の対象外のため、以下を新規追加する。

```ts
export async function getSimpleChapterStatuses(projectId: string): Promise<Record<number, "not_started" | "in_progress">> {
  const supabase = await createServerActionClient();
  const results: Record<number, "not_started" | "in_progress"> = {};

  const { count: kpiCount } = await supabase.from("requirement_items").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("chapter_no", 4);
  results[4] = (kpiCount ?? 0) > 0 ? "in_progress" : "not_started";

  const { count: nonFuncCount } = await supabase.from("requirement_items").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("chapter_no", 10);
  results[10] = (nonFuncCount ?? 0) > 0 ? "in_progress" : "not_started";

  const { count: progressCount } = await supabase.from("progress_tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  results[15] = (progressCount ?? 0) > 0 ? "in_progress" : "not_started";

  return results;
}
```

**注意**：D/E/ガント章には「確定」という概念上の区切りが明確でない（KPIツリーやチェックリストには`confirmed`ステータスの一律運用が無い）ため、このStepでは簡易的に「未着手/進行中」の2段階のみとする。将来的に精緻化が必要になれば別Stepで対応する。

## Step 2: サイドバーをグループ分け＋ステータス表示に更新

`src/app/projects/[id]/layout.tsx`を修正する。

```tsx
import { getReadinessSummary, chapterStatusFromReadiness } from "@/actions/readiness";
import { getSimpleChapterStatuses } from "@/actions/readiness";
import { statusColor } from "@/lib/chapter-status";

// レイアウト内、既存のselectedChapters取得に続けて
const readiness = await getReadinessSummary(id);
const simpleStatuses = await getSimpleChapterStatuses(id);
const readinessMap = new Map(readiness.map((r) => [r.chapterNo, chapterStatusFromReadiness(r)]));

function chapterDot(chapterNo: number) {
  const status = readinessMap.get(chapterNo) ?? simpleStatuses[chapterNo] ?? "not_started";
  const { bg } = statusColor(status as any);
  return <span style={{ backgroundColor: bg }} className="w-1.5 h-1.5 rounded-full inline-block" />;
}
```

章リンクの表示に、この`chapterDot`を追加する。

```tsx
{selectedChapters.map((n) => (
  <Link key={n} href={`/projects/${id}/chapters/${n}`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1 flex items-center gap-2">
    {chapterDot(n)}
    {n}. {CHAPTER_NAMES[n]}
  </Link>
))}
```

サイドバーのセクション分けを、現状の「要件定義／関連機能」の2区分から、以下の3区分に整理する。

- **要件定義**（既存、章一覧）
- **確定判定**（確定判定ダッシュボード・整合性チェック・ベースライン・差分管理）
- **案件管理**（資料・業務フロー・工数記録・メンバー・案件設定）

## Step 3: 全体進捗バーをヘッダーに常時表示

サイドバー上部（案件名の下あたり）に、平均充足率のバーを追加する。

```tsx
const avgReadiness = readiness.length > 0
  ? Math.round(readiness.reduce((sum, r) => sum + r.readinessRate, 0) / readiness.length)
  : 0;
```

```tsx
<div className="mb-3">
  <div className="flex justify-between text-[10px] text-faint mb-1">
    <span>全体進捗</span><span>{avgReadiness}%</span>
  </div>
  <div className="h-1 bg-border rounded-full overflow-hidden">
    <div style={{ width: `${avgReadiness}%` }} className="h-full bg-brand" />
  </div>
</div>
```

## Step 4: 深い階層のページにパンくずを追加

以下のページの先頭に、元の章ページに戻るリンクを追加する。

- `src/app/projects/[id]/chapters/9/screens/page.tsx`
- `src/app/projects/[id]/chapters/9/screen-transitions/page.tsx`
- `src/app/projects/[id]/chapters/[chapterNo]/consistency/page.tsx`
- `src/app/projects/[id]/chapters/[chapterNo]/cross-reference/page.tsx`
- `src/app/projects/[id]/business-flow/diff/page.tsx`

```tsx
<Link href={`/projects/${id}/chapters/9`} className="text-xs text-secondary underline mb-3 inline-block">
  ← 9. 機能要件に戻る
</Link>
```

（`business-flow/diff`は`← 業務フローに戻る`とし、リンク先を`/projects/${id}/business-flow`にする）

**注意**：対象ファイルは会話の記録から列挙したものであり漏れの可能性がある。`grep -rln "params: Promise<{ id: string" src/app/projects/\[id\]` 等でネストの深いページを洗い出し、パンくずが無いものが他に無いか確認すること（規約36・37の教訓）。

## Step 5: 動作確認

1. サイドバーの各章に、状況に応じた色のドット（未着手/進行中/確定）が表示されることを確認する
2. サイドバーが「要件定義／確定判定／案件管理」の3区分に整理されていることを確認する
3. サイドバー上部に全体進捗バーが表示され、いずれかの項目を確定させると数値が更新されることを確認する
4. 画面遷移図・画面イメージ・章別整合性チェック等のページで、元の章に戻るリンクが機能することを確認する
5. 既存の全機能（各リンク先への遷移）が壊れていないことを一通り確認する

## やってはいけないこと

- D/E/ガント章のステータス判定を、A/B/C章と同じ「充足率」の概念で無理に統一しない（構造が異なるため、Step1の簡易2段階のままでよい）
- パンくずのために新しいルーティングの仕組み（Next.jsの規約に無いもの）を導入しない。単純なリンクで十分とする

## 完了条件

- [ ] 章ステータス判定ロジック実装済み
- [ ] サイドバーのグループ分け・ステータスドット表示実装済み
- [ ] 全体進捗バー実装済み
- [ ] 主要な下位ページへのパンくず追加済み（grep確認込み）
- [ ] 動作確認済み
