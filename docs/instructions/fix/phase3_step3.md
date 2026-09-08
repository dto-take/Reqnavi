# 指示書：Phase3 Step3 整合性チェック（項目/章/全体）

## 目的

ボタン起点で、孤立要件（出典が無い項目）・未反映（業務フローTo-Beの新設ステップが機能要件に反映されていない）を検出する。3段階（項目/章/全体）はいずれもボタン操作でのみ実行し、自動発火はしない（CLAUDE.md規約7）。詳細は `docs/01_requirements.md` §9（機能No.9）を参照。

## スコープの限定

- **孤立要件検知**：`item_sources`に紐付けが無い項目を検出する（テンプレートA/B/C対象。D/E/ガントは対象外、これまでの他機能と同じ切り方）。手動追加した項目は出典が無いのが自然なので、これは「異常」ではなく「確認材料」として提示する（自動で何かを変更しない）。
- **未反映検知**：Phase2 Step4の差分検出ロジック（`diffFlowSteps`）を再利用し、業務フローTo-Beの新設ステップのうち、9章（機能要件）に同名の項目がまだ作られていないものを一覧表示する。
- 項目単位のチェックは、章単位の結果を1項目分に絞り込んだものとして実装する（軽量な実装で3段階を成立させる）。

## 前提確認

- Phase3 Step2（例外承認ワークフロー）が完了していること

---

## Step 1: 孤立要件検知のServer Actionを作成

新規ファイル `src/actions/consistency.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { diffFlowSteps } from "@/lib/business-flow/diff";
import { listFlowSteps } from "@/actions/business-flow";
import { listRequirementItems } from "@/actions/requirement-items";

const FLAT_TEMPLATE_CHAPTERS: Record<number, string> = {
  5: "A", 7: "A", 6: "C", 8: "C", 9: "C", 12: "C", 11: "B", 13: "B", 14: "B",
};

export type OrphanItem = { id: string; chapterNo: number; name: string };

export async function checkOrphanItems(projectId: string, chapterNo?: number): Promise<OrphanItem[]> {
  const supabase = await createServerActionClient();
  const targetChapters = chapterNo ? [chapterNo] : Object.keys(FLAT_TEMPLATE_CHAPTERS).map(Number);

  const orphans: OrphanItem[] = [];
  for (const c of targetChapters) {
    const { data: items, error } = await supabase
      .from("requirement_items")
      .select("id, content")
      .eq("project_id", projectId)
      .eq("chapter_no", c);
    if (error) throw error;
    if (!items || items.length === 0) continue;

    const { data: sources } = await supabase
      .from("item_sources")
      .select("item_id")
      .in("item_id", items.map((i) => i.id));
    const itemIdsWithSource = new Set((sources ?? []).map((s) => s.item_id));

    for (const item of items) {
      if (!itemIdsWithSource.has(item.id)) {
        orphans.push({
          id: item.id,
          chapterNo: c,
          name: item.content?.name ?? item.content?.issue ?? item.content?.what ?? "(名称なし)",
        });
      }
    }
  }
  return orphans;
}

export async function checkUnreflectedSteps(projectId: string) {
  const [asisSteps, tobeSteps, functionalItems] = await Promise.all([
    listFlowSteps(projectId, "business_asis"),
    listFlowSteps(projectId, "business_tobe"),
    listRequirementItems(projectId, 9),
  ]);

  const { newSteps } = diffFlowSteps(asisSteps, tobeSteps);
  const existingNames = new Set(functionalItems.map((i) => (i.content.name ?? "").trim().toLowerCase()));

  return newSteps.filter((s) => !existingNames.has(s.label.trim().toLowerCase()));
}
```

## Step 2: 章チェック・項目チェック画面を作成

新規ファイル `src/app/projects/[id]/chapters/[chapterNo]/consistency/page.tsx`。

```tsx
import { checkOrphanItems } from "@/actions/consistency";

export default async function ChapterConsistencyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chapterNo: string }>;
  searchParams: Promise<{ item_id?: string }>;
}) {
  const { id, chapterNo } = await params;
  const { item_id } = await searchParams;
  const chapterNum = Number(chapterNo);

  const orphans = await checkOrphanItems(id, chapterNum);
  const filtered = item_id ? orphans.filter((o) => o.id === item_id) : orphans;

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-page border border-border rounded-lg p-6">
      <h1 className="text-base font-semibold text-primary mb-1">
        {item_id ? "項目チェック" : "章の整合性チェック"}
      </h1>
      <p className="text-xs text-secondary mb-4">出典（根拠資料）が紐付いていない項目を表示します</p>

      {filtered.length === 0 ? (
        <p className="text-sm text-secondary">
          {item_id ? "この項目には孤立の問題はありません" : "孤立している項目はありません"}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((o) => (
            <li key={o.id} className="text-sm text-[#AF3D3D] bg-[#FBE4E4] rounded-md px-3 py-2">
              {o.name}（出典なし）
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`RequirementTable.tsx`の各行に、項目単位のチェックへのリンクを追加する（既存のステータス操作列の近くでよい）。

```tsx
<a
  href={`/projects/${projectId}/chapters/${chapterNo}/consistency?item_id=${item.id}`}
  className="text-xs text-faint underline"
>
  この項目を確認
</a>
```

## Step 3: 全体チェック画面を作成

新規ファイル `src/app/projects/[id]/consistency/page.tsx`。

```tsx
import { checkOrphanItems, checkUnreflectedSteps } from "@/actions/consistency";

export default async function ProjectConsistencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orphans, unreflected] = await Promise.all([
    checkOrphanItems(id),
    checkUnreflectedSteps(id),
  ]);

  return (
    <div className="max-w-2xl mx-auto mt-10 flex flex-col gap-6">
      <div className="bg-page border border-border rounded-lg p-6">
        <h1 className="text-base font-semibold text-primary mb-1">全体整合性チェック：孤立要件</h1>
        <p className="text-xs text-secondary mb-4">案件全体で、出典が紐付いていない項目（{orphans.length}件）</p>
        {orphans.length === 0 ? (
          <p className="text-sm text-secondary">孤立している項目はありません</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {orphans.map((o) => (
              <li key={o.id} className="text-sm text-[#AF3D3D] bg-[#FBE4E4] rounded-md px-3 py-2">
                {o.chapterNo}章：{o.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-page border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-primary mb-1">全体整合性チェック：未反映ステップ</h2>
        <p className="text-xs text-secondary mb-4">
          業務フローTo-Beの新設ステップのうち、機能要件（9章）にまだ反映されていないもの（{unreflected.length}件）
        </p>
        {unreflected.length === 0 ? (
          <p className="text-sm text-secondary">未反映のステップはありません</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5 mb-3">
              {unreflected.map((s) => (
                <li key={s.id} className="text-sm text-[#9F6B00] bg-[#FDECC8] rounded-md px-3 py-2">
                  {s.label}
                </li>
              ))}
            </ul>
            <a href={`/projects/${id}/business-flow/diff`} className="text-xs text-secondary underline">
              業務フロー差分確認画面で反映する
            </a>
          </>
        )}
      </div>
    </div>
  );
}
```

## Step 4: サイドバーに全体チェックへの導線を追加

`src/app/projects/[id]/layout.tsx`に追加する。

```tsx
<Link href={`/projects/${id}/consistency`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
  整合性チェック（全体）
</Link>
```

## Step 5: 動作確認

1. 手動で機能要件（9章）に1行追加（AI素案生成を使わない）し、`/projects/{id}/chapters/9/consistency` で章チェックを実行→この項目が「出典なし」として表示されることを確認
2. AI素案生成で作成した項目（`item_sources`が紐付いている）は孤立要件として表示されないことを確認
3. `RequirementTable`の「この項目を確認」リンクから、その項目1件のみに絞り込んだ結果が表示されることを確認
4. 業務フローTo-Beに、まだ機能要件へ反映していない新設ステップを1件作っておき、`/projects/{id}/consistency` で「未反映ステップ」として検出されることを確認
5. `/projects/{id}/business-flow/diff` へのリンクから、実際にその場で機能要件へ反映できることを確認（Phase2 Step4の機能と接続していることの確認）

## やってはいけないこと

- 孤立要件・未反映の検出結果をもとに、AIやシステムが自動的に何かを修正・作成しない（あくまで気づきの提示。反映は既存のPhase2 Step4の画面から手動で行う）
- このStepで新しい自動発火の仕組み（cron等）を追加しない（ボタン起点を維持）

## 完了条件

- [ ] 孤立要件検知（項目/章/全体）実装済み
- [ ] 未反映検知（全体）実装済み、Phase2 Step4の差分確認画面と接続済み
- [ ] 動作確認済み
