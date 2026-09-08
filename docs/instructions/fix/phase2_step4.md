# 指示書：Phase2 Step4 As-Is/To-Be差分検出→機能要件への反映提案

## 目的

As-IsとTo-Beの業務フローを比較し、To-Beで新設されたステップを検出して、機能要件（9章）への反映案（`ai_draft`状態の新規項目）として提示する。詳細は `docs/01_requirements.md` §9（機能No.5）を参照。

## スコープの限定（重要）

このStepでは**「To-Beで新設されたステップ→機能要件への提案」の方向のみ**を実装する。「As-Isから削除されたステップ→既存の機能要件への影響」は、既存の機能要件とステップの間に紐付け情報が無く、精度の高い自動検出が難しいため、**一覧表示のみ（自動アクションなし）とする**。将来的に精度を上げたくなった場合は別Stepで対応を検討する。

## 前提確認

- Phase2 Step3（ドラッグ&ドロップ編集）が完了していること

---

## Step 1: 差分検出ロジックを作成

新規ファイル `src/lib/business-flow/diff.ts`（通常モジュール）。

```ts
import type { FlowStep } from "@/actions/business-flow";

export type FlowDiffResult = {
  newSteps: FlowStep[];      // To-Beのみに存在
  removedSteps: FlowStep[];  // As-Isのみに存在
};

// ラベルの完全一致（前後空白除去・大文字小文字無視）で比較する簡易実装。
// 表記ゆれ（「顧客登録」と「顧客情報登録」等）は同一ステップとして検出できない前提。
export function diffFlowSteps(asisSteps: FlowStep[], tobeSteps: FlowStep[]): FlowDiffResult {
  const normalize = (s: string) => s.trim().toLowerCase();
  const asisLabels = new Set(asisSteps.map((s) => normalize(s.label)));
  const tobeLabels = new Set(tobeSteps.map((s) => normalize(s.label)));

  return {
    newSteps: tobeSteps.filter((s) => !asisLabels.has(normalize(s.label))),
    removedSteps: asisSteps.filter((s) => !tobeLabels.has(normalize(s.label))),
  };
}
```

## Step 2: Server Actionsを作成

新規ファイル `src/actions/flow-diff.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { listFlowSteps } from "@/actions/business-flow";
import { diffFlowSteps } from "@/lib/business-flow/diff";
import { revalidatePath } from "next/cache";

export async function getFlowDiff(projectId: string) {
  const [asisSteps, tobeSteps] = await Promise.all([
    listFlowSteps(projectId, "business_asis"),
    listFlowSteps(projectId, "business_tobe"),
  ]);
  return diffFlowSteps(asisSteps, tobeSteps);
}

export async function proposeFunctionalRequirements(
  projectId: string,
  formData: FormData
) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");

  const selectedStepIds = formData.getAll("step_id") as string[];
  const selectedLabels = formData.getAll("step_label") as string[];

  const rows = selectedStepIds.map((_, i) => ({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 9,
    template_type: "C",
    content: {
      category: "",
      name: selectedLabels[i],
      detail: `業務フローTo-Beの新設ステップ「${selectedLabels[i]}」に基づく提案`,
      item_type: "",
      platform_feature: null,
    },
    status: "ai_draft",
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("requirement_items").insert(rows);
    if (error) throw error;
  }

  revalidatePath(`/projects/${projectId}/business-flow/diff`);
  revalidatePath(`/projects/${projectId}/chapters/9`);
}
```

**注意**：`listFlowSteps`は`business-flow.ts`で既にexportされている前提（Phase2 Step1参照）。もしexportされていない場合はそちらを修正すること。

## Step 3: 差分確認画面を作成

新規ファイル `src/app/projects/[id]/business-flow/diff/page.tsx`。

```tsx
import { getFlowDiff, proposeFunctionalRequirements } from "@/actions/flow-diff";

export default async function FlowDiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { newSteps, removedSteps } = await getFlowDiff(id);
  const propose = proposeFunctionalRequirements.bind(null, id);

  return (
    <div className="max-w-2xl mx-auto mt-10 flex flex-col gap-6">
      <div className="bg-page border border-border rounded-lg p-6">
        <h1 className="text-base font-semibold text-primary mb-1">
          To-Beで新設されたステップ
        </h1>
        <p className="text-xs text-secondary mb-4">
          選択して「機能要件へ反映」を押すと、9章に素案（AI素案ステータス）として追加されます
        </p>

        {newSteps.length === 0 ? (
          <p className="text-sm text-secondary">新設されたステップはありません</p>
        ) : (
          <form action={propose}>
            <div className="flex flex-col gap-2 mb-4">
              {newSteps.map((step) => (
                <label key={step.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="step_id" value={step.id} defaultChecked />
                  <input type="hidden" name="step_label" value={step.label} />
                  {step.label}
                  <span className="text-xs text-faint">（{step.role_lane}）</span>
                </label>
              ))}
            </div>
            <button type="submit" className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium">
              機能要件へ反映
            </button>
          </form>
        )}
      </div>

      <div className="bg-page border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-primary mb-1">
          As-Isから削除されたステップ（参考情報）
        </h2>
        <p className="text-xs text-secondary mb-3">
          既存の機能要件への影響有無はSE自身でご確認ください（自動判定は行いません）
        </p>
        {removedSteps.length === 0 ? (
          <p className="text-sm text-secondary">削除されたステップはありません</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {removedSteps.map((step) => (
              <li key={step.id} className="text-sm text-secondary">
                {step.label}（{step.role_lane}）
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

**注意**：`step_id`と`step_label`をチェックボックスと隠しフィールドのペアで送っているため、`formData.getAll("step_id")`と`formData.getAll("step_label")`の順序が一致している前提のコードになっている。ブラウザのFormData実装がDOM順を保証することに依存しているため、順序保証に不安がある場合は、チェックボックスの`value`をJSON文字列（`id`と`label`をまとめたもの）にする実装に変更すること。

## Step 4: 業務フロー画面から差分確認画面へのリンクを追加

`src/app/projects/[id]/business-flow/page.tsx`に、差分確認画面へのリンクを追加する。

```tsx
<a href={`/projects/${id}/business-flow/diff`} className="text-sm text-secondary underline">
  As-Is/To-Be差分を確認
</a>
```

## Step 5: 動作確認

1. As-Isに3ステップ、To-Beに同じ3ステップ+新規1ステップを登録する
2. `/projects/{id}/business-flow/diff` にアクセスし、新設ステップとして1件のみ表示されることを確認
3. チェックを付けたまま「機能要件へ反映」を押す
4. `/projects/{id}/chapters/9` に遷移し、`ai_draft`ステータスの新しい行が追加されていることを確認（`name`列に新設ステップ名が入っている）
5. As-Isから1ステップを削除（Step1の削除機能を使う）し、再度差分画面を確認→「削除されたステップ」欄に表示されることを確認（こちらは自動アクションが起きないことも確認）

## やってはいけないこと

- 「削除されたステップ」に対して、既存の機能要件を自動的に削除・変更する処理を実装しない（スコープの限定の通り、一覧表示のみ）
- 反映した機能要件を`ai_draft`以外のステータスで作成しない

## 完了条件

- [ ] 差分検出ロジック実装済み
- [ ] 新設ステップの一覧表示・選択反映が動作確認済み
- [ ] 削除ステップの一覧表示（情報提供のみ）が動作確認済み
