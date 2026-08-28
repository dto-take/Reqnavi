# 指示書：Phase1 Step6 曖昧表現検出（辞書ベース）

## 目的

テンプレートA/B/Cの要件項目に対し、「等」「柔軟に」等の曖昧な表現を機械的に検出し、`ambiguous_flags`に記録する。AI判定（段階2）は対象外とし、辞書マッチのみを実装する。詳細は `docs/01_requirements.md` §9（機能No.8）・`docs/02_architecture.md` 5.3節を参照。

## 前提確認

- Phase1 Step5（AI素案生成）が完了していること

---

## Step 1: 曖昧表現辞書を定義

新規ファイル `src/lib/ambiguous-phrases.ts`（`"use server"`は付けない通常モジュール。CLAUDE.md規約17に従う）。

```ts
export const AMBIGUOUS_PHRASES = [
  "等", "柔軟に", "原則として", "基本的に", "場合によっては",
  "適宜", "必要に応じて", "できる限り", "概ね",
] as const;

export type AmbiguousFlag = {
  field: string;
  phrase: string;
  matched_text: string;
};

export function scanContentForAmbiguousPhrases(
  content: Record<string, string | null>
): AmbiguousFlag[] {
  const flags: AmbiguousFlag[] = [];
  for (const [field, value] of Object.entries(content)) {
    if (!value) continue;
    for (const phrase of AMBIGUOUS_PHRASES) {
      if (value.includes(phrase)) {
        flags.push({ field, phrase, matched_text: value });
      }
    }
  }
  return flags;
}
```

## Step 2: 曖昧表現チェックのServer Actionを作成

新規ファイル `src/actions/ambiguous-check.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { scanContentForAmbiguousPhrases } from "@/lib/ambiguous-phrases";
import { revalidatePath } from "next/cache";

export async function runAmbiguousCheck(projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: items, error } = await supabase
    .from("requirement_items")
    .select("id, content")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;

  for (const item of items) {
    const flags = scanContentForAmbiguousPhrases(item.content as Record<string, string | null>);
    const { error: updateError } = await supabase
      .from("requirement_items")
      .update({ ambiguous_flags: flags })
      .eq("id", item.id);
    if (updateError) throw updateError;
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

**注意**：既存の`ambiguous_flags`を毎回全件上書きする実装にしている（差分更新はしない）。これは辞書チェックが決定的（同じ入力なら同じ結果）であるため問題ないが、将来AI判定（段階2）の結果もこの列に混在させる場合は、上書きせず追記する設計に変更する必要がある。このStepの段階では上書きでよい。

## Step 3: RequirementItem型・一覧取得にambiguous_flagsを追加

`src/actions/requirement-items.ts`の`RequirementItem`型と`listRequirementItems`のselect句を以下のように拡張する。

```ts
export type RequirementItem = {
  id: string;
  chapter_no: number;
  template_type: string;
  content: Record<string, string>;
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved";
  ambiguous_flags: { field: string; phrase: string; matched_text: string }[];
};
```

```ts
.select("id, chapter_no, template_type, content, status, ambiguous_flags")
```

## Step 4: テーブルエディタに警告表示を追加

`src/components/domain/requirement-table/RequirementTable.tsx`のステータス列の隣に、曖昧フラグがある場合のインジケーターを追加する。

```tsx
<div className="px-3 py-2 flex items-center gap-1.5">
  <StatusBadge status={item.status === "exception_approved" ? "confirmed" : item.status} />
  {item.ambiguous_flags?.length > 0 && (
    <span
      title={item.ambiguous_flags.map((f) => `${f.field}: 「${f.phrase}」`).join(", ")}
      className="text-xs text-[#9F6B00]"
    >
      ⚠ {item.ambiguous_flags.length}
    </span>
  )}
</div>
```

## Step 5: 章ページに「曖昧表現チェック」ボタンを追加

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`の「AI素案を生成」ボタンの隣に追加する。

```tsx
import { runAmbiguousCheck } from "@/actions/ambiguous-check";
// ...

<form action={runAmbiguousCheck.bind(null, id, chapterNum)}>
  <button className="h-8 px-3 border border-border rounded-md text-sm">
    曖昧表現チェック
  </button>
</form>
```

## Step 6: 動作確認

1. いずれかの章で、内容に「等」または「柔軟に対応」を含むテキストをセルに入力し保存
2. 「曖昧表現チェック」ボタンを押す
3. 該当行に⚠マークと検出件数が表示されることを確認
4. マウスオーバー（`title`属性）で、どのフィールド・どの表現が検出されたかが確認できることを確認
5. 曖昧な表現を含まない行には⚠マークが出ないことを確認

## やってはいけないこと

- 辞書マッチの結果をもとに、AIによる自動修正・自動確定を行わない（あくまで気づきの提示に留める、`docs/02_architecture.md` 5.3節の方針）
- `ambiguous_flags`の更新処理を、確定済み（`confirmed`）項目に対しても実行して構わないが、その結果によって`status`を変更しない（曖昧表現チェックはステータス管理とは独立した機能）

## 完了条件

- [ ] 辞書・スキャン関数実装済み
- [ ] `runAmbiguousCheck`実装済み
- [ ] テーブルエディタに警告インジケーター表示済み
- [ ] 実データでの検出動作確認済み
