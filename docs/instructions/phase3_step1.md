# 指示書：Phase3 Step1 充足率ダッシュボード

## 目的

章ごとの充足率・曖昧表現件数・要ヒアリング件数を可視化し、「この状態で見積りに進んでよいか」をSE・PMが客観的に判断できるようにする。詳細は `docs/01_requirements.md` §9（機能No.10）を参照。

## 集計方針（重要・スコープの限定）

- **対象はテンプレートA/B/Cを使う章のみ**（5,6,7,8,9,11,12,13,14）。テンプレートD（4章KPI）・E（10章非機能要件）・ガント（15章進捗）は構造が異なるため、このStepでは対象外とし、ダッシュボード上は「対象外」と表示する（これまでの曖昧表現検出・Flow1と同じスコープの切り方を踏襲）。
- **充足率** = 確定済み（`status='confirmed'`）項目数 ÷ 全項目数（0件の場合は0%）
- **曖昧表現件数** = 章内の全項目の`ambiguous_flags`の合計件数
- **要ヒアリング件数** = 章内の項目のうち、その章のテンプレート列のいずれかが空欄（null/空文字）になっている項目数

## 前提確認

- Phase2までのすべてのStep、および認証・メンバー管理、画面ワイヤーフレームパターンの作り忘れ解消が完了していること

---

## Step 1: 充足率集計のServer Actionを作成

新規ファイル `src/actions/readiness.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";

const FLAT_TEMPLATE_CHAPTERS: Record<number, string> = {
  5: "A", 7: "A", 6: "C", 8: "C", 9: "C", 12: "C", 11: "B", 13: "B", 14: "B",
};

export type ChapterReadiness = {
  chapterNo: number;
  templateType: string;
  totalItems: number;
  confirmedItems: number;
  readinessRate: number;
  ambiguousCount: number;
  needHearingCount: number;
};

export async function getReadinessSummary(projectId: string): Promise<ChapterReadiness[]> {
  const supabase = await createServerActionClient();

  const { data: project } = await supabase
    .from("projects")
    .select("selected_chapters")
    .eq("id", projectId)
    .single();
  const selectedChapters = (project?.selected_chapters as number[]) ?? [];

  const targetChapters = selectedChapters.filter((c) => FLAT_TEMPLATE_CHAPTERS[c]);
  const results: ChapterReadiness[] = [];

  for (const chapterNo of targetChapters) {
    const templateType = FLAT_TEMPLATE_CHAPTERS[chapterNo];

    const { data: items, error } = await supabase
      .from("requirement_items")
      .select("content, status, ambiguous_flags")
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo);
    if (error) throw error;

    const { data: columns } = await supabase
      .from("chapter_column_templates")
      .select("column_key")
      .eq("template_type", templateType);
    const columnKeys = (columns ?? []).map((c) => c.column_key);

    const totalItems = items?.length ?? 0;
    const confirmedItems = items?.filter((i) => i.status === "confirmed").length ?? 0;
    const ambiguousCount = items?.reduce((sum, i) => sum + (i.ambiguous_flags?.length ?? 0), 0) ?? 0;
    const needHearingCount = items?.filter((i) =>
      columnKeys.some((key) => !i.content?.[key] || i.content[key].trim() === "")
    ).length ?? 0;

    results.push({
      chapterNo,
      templateType,
      totalItems,
      confirmedItems,
      readinessRate: totalItems > 0 ? Math.round((confirmedItems / totalItems) * 100) : 0,
      ambiguousCount,
      needHearingCount,
    });
  }

  return results;
}
```

## Step 2: ダッシュボード画面を作成

新規ファイル `src/app/projects/[id]/readiness/page.tsx`。

```tsx
import { getReadinessSummary } from "@/actions/readiness";

const CHAPTER_NAMES: Record<number, string> = {
  5: "システム要件", 6: "開発スコープ", 7: "ビジネス要件", 8: "業務要件",
  9: "機能要件", 11: "データ移行要件", 12: "トレーニング要件",
  13: "システム運用要件", 14: "システム定着化支援要件",
};

function barColor(rate: number): string {
  if (rate >= 80) return "#448361";
  if (rate >= 40) return "#9F6B00";
  return "#AF3D3D";
}

export default async function ReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = await getReadinessSummary(id);

  const lowChapters = summary.filter((s) => s.readinessRate < 50 || s.ambiguousCount > 3);

  return (
    <div className="max-w-3xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-4">要件確定判定ダッシュボード</h1>

      <div className="grid grid-cols-4 gap-2 text-xs text-secondary px-2 mb-1">
        <span>章</span>
        <span>充足率</span>
        <span>曖昧表現</span>
        <span>要ヒアリング</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {summary.map((s) => (
          <div key={s.chapterNo} className="grid grid-cols-4 items-center bg-sidebar rounded-md px-3 py-2 text-sm">
            <span>{s.chapterNo}. {CHAPTER_NAMES[s.chapterNo]}</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div style={{ width: `${s.readinessRate}%`, backgroundColor: barColor(s.readinessRate) }} className="h-full" />
              </div>
              <span className="text-xs text-secondary w-9">{s.readinessRate}%</span>
            </div>
            <span className={s.ambiguousCount > 3 ? "text-[#AF3D3D]" : "text-secondary"}>{s.ambiguousCount}件</span>
            <span className={s.needHearingCount > 0 ? "text-[#9F6B00]" : "text-secondary"}>{s.needHearingCount}件</span>
          </div>
        ))}
      </div>

      {lowChapters.length > 0 && (
        <div className="mt-4 p-3 bg-[#FBE4E4] rounded-md text-xs text-[#AF3D3D]">
          充足率が低い、または曖昧表現の多い章があります。この状態での確定・見積りは推奨されません。
        </div>
      )}
    </div>
  );
}
```

## Step 3: サイドバーにダッシュボードへの導線を追加

`src/app/projects/[id]/layout.tsx`のサイドバーに追加する。

```tsx
<Link href={`/projects/${id}/readiness`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
  確定判定ダッシュボード
</Link>
```

## Step 4: 動作確認

1. 複数の章にまたがってデータが入力済みの案件で `/projects/{id}/readiness` にアクセスする
2. 各章の充足率（確定済み項目数÷全項目数）が正しく計算されていることを確認
3. いずれかの項目に曖昧表現フラグが付いている章で、曖昧表現件数が正しく集計されていることを確認
4. いずれかの項目で列が未入力（空欄）の章で、要ヒアリング件数が正しくカウントされていることを確認
5. 充足率が低い章がある場合、警告メッセージが表示されることを確認
6. テンプレートD/E/ガントの章（4・10・15）がダッシュボードの集計対象に含まれていないことを確認

## やってはいけないこと

- このStepでは、充足率に基づいて自動的に何かを確定・ロックする処理を実装しない（次のStep4:ベースライン確定で対応する）
- テンプレートD/E/ガントの章を無理に同じロジックで集計しようとしない（構造が異なるため誤った数値になる）

## 完了条件

- [ ] `getReadinessSummary`実装済み
- [ ] ダッシュボード画面で充足率・曖昧表現件数・要ヒアリング件数が正しく表示されることを確認済み
- [ ] サイドバーからダッシュボードに遷移できることを確認済み
