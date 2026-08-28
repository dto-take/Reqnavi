# 指示書：Phase2 Step8 曖昧表現のAI判定（段階2）

## 目的

Phase1 Step6で実装した辞書ベース検出（段階1）に加えて、辞書に無い曖昧さをAIの文脈判定で補足する（段階2）。`docs/02_architecture.md` 5.3節の方針どおり、コスト抑制のためボタン起点で実行し、常時実行はしない。詳細は `docs/01_requirements.md` §9（機能No.8）を参照。

## 重要：既存の辞書チェックとの整合

Phase1 Step6の`runAmbiguousCheck`は`ambiguous_flags`を**毎回全件上書き**する実装だった（そのStepの時点では辞書チェックのみだったため問題なかった）。段階2を追加する今回、上書きし合うと片方の結果が消えるため、**`ambiguous_flags`の各要素に`source`（`'dictionary'` | `'ai'`）を持たせ、実行時は自分のsourceの要素だけを入れ替える**方式に変更する。

## 前提確認

- Phase1 Step6（曖昧表現検出・辞書ベース）が完了していること
- Phase2 Step1〜7が完了していること

---

## Step 1: 辞書側の実装をsource対応に修正

`src/lib/ambiguous-phrases.ts`の`AmbiguousFlag`型と`scanContentForAmbiguousPhrases`を修正する。

```ts
export type AmbiguousFlag = {
  source: "dictionary" | "ai";
  field: string;
  phrase?: string;      // dictionary判定時のみ
  reason?: string;      // ai判定時のみ
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
        flags.push({ source: "dictionary", field, phrase, matched_text: value });
      }
    }
  }
  return flags;
}
```

`src/actions/ambiguous-check.ts`の`runAmbiguousCheck`を、AI側のフラグを保持したまま辞書側のみ入れ替える実装に修正する。

```ts
export async function runAmbiguousCheck(projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: items, error } = await supabase
    .from("requirement_items")
    .select("id, content, ambiguous_flags")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;

  for (const item of items) {
    const dictionaryFlags = scanContentForAmbiguousPhrases(item.content as Record<string, string | null>);
    const existingAiFlags = (item.ambiguous_flags ?? []).filter((f: { source: string }) => f.source === "ai");
    const nextFlags = [...existingAiFlags, ...dictionaryFlags];

    const { error: updateError } = await supabase
      .from("requirement_items")
      .update({ ambiguous_flags: nextFlags })
      .eq("id", item.id);
    if (updateError) throw updateError;
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

## Step 2: AI判定用プロンプトをシード

```sql
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('ambiguity_check_l2', null, 'v1',
'以下の要件項目について、"具体的な判断基準（数値・条件・担当者名など）が欠けている"表現がないか判定してください。

判定対象が本当に曖昧か迷う場合は ambiguous: false としてください
（過剰検知よりも見落としが少ない方を優先し、最終判断はSEが行います）。

出力は以下のJSON形式のみとし、説明文・コードブロック記号は一切含めないこと。
{"ambiguous": boolean, "field": "対象フィールドキー", "reason": string | null}

【要件項目】
{item_content}',
true);
```

## Step 3: AI判定のServer Actionを作成

`src/actions/ambiguous-check.ts`に追加する。

```ts
import { getActivePrompt } from "@/lib/ai/prompts";
import { z } from "zod";

const AiAmbiguitySchema = z.object({
  ambiguous: z.boolean(),
  field: z.string().nullable(),
  reason: z.string().nullable(),
});

export async function runAmbiguousCheckAI(projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: items, error } = await supabase
    .from("requirement_items")
    .select("id, content, ambiguous_flags")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  if (error) throw error;

  const { id: promptId, body: promptBody } = await getActivePrompt("ambiguity_check_l2");
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  for (const item of items) {
    const filledPrompt = promptBody.replace("{item_content}", JSON.stringify(item.content));
    const response = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: filledPrompt });
    const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();

    const parsed = AiAmbiguitySchema.safeParse(JSON.parse(cleaned));
    await supabase.from("ai_interactions").insert({
      project_id: projectId,
      prompt_id: promptId,
      input_summary: { item_id: item.id },
      output: parsed.success ? parsed.data : { error: "validation_failed" },
    });
    if (!parsed.success || !parsed.data.ambiguous) continue;

    const existingDictionaryFlags = (item.ambiguous_flags ?? []).filter((f: { source: string }) => f.source === "dictionary");
    const nextFlags = [
      ...existingDictionaryFlags,
      { source: "ai" as const, field: parsed.data.field ?? "", reason: parsed.data.reason, matched_text: "" },
    ];

    await supabase.from("requirement_items").update({ ambiguous_flags: nextFlags }).eq("id", item.id);
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

**注意（コストに関する重要事項）**：この実装は項目1件ごとにAI APIを1回呼び出す。項目数が多い章では呼び出し回数・待ち時間・コストが線形に増える。動作確認時に許容範囲か確認し、問題が大きい場合は複数項目をまとめて1回のプロンプトで判定させる方式への変更を検討すること（本指示書ではまず素直な実装を優先する）。

## Step 4: テーブルエディタの警告表示をsource対応に更新

`src/components/domain/requirement-table/RequirementTable.tsx`の警告表示（Phase1 Step6で追加）を、source別に表示し分ける。

```tsx
{item.ambiguous_flags?.length > 0 && (
  <span
    title={item.ambiguous_flags
      .map((f) => f.source === "dictionary" ? `[辞書] ${f.field}: 「${f.phrase}」` : `[AI] ${f.field}: ${f.reason}`)
      .join(", ")}
    className="text-xs text-[#9F6B00]"
  >
    ⚠ {item.ambiguous_flags.length}
  </span>
)}
```

## Step 5: 章ページにAI判定ボタンを追加

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`の「曖昧表現チェック」ボタンの隣に追加する。

```tsx
import { runAmbiguousCheckAI } from "@/actions/ambiguous-check";
// ...

<form action={runAmbiguousCheckAI.bind(null, id, chapterNum)}>
  <button className="h-8 px-3 border border-border rounded-md text-sm">
    AI曖昧判定（詳細）
  </button>
</form>
```

## Step 6: 動作確認

1. 何らかの要件項目に、辞書には引っかからないが判断基準が曖昧な文章（例：「必要な場合は対応する」のように辞書フレーズを含まないが具体性に欠ける文）を入力する
2. 「AI曖昧判定（詳細）」を実行し、⚠マークが追加されることを確認
3. マウスオーバーで`[AI]`のラベルと理由が表示されることを確認
4. 続けて「曖昧表現チェック」（辞書ベース）を実行し、AI判定の結果が消えずに残っていることを確認（source別の入れ替えが正しく機能しているか）
5. `ai_interactions`テーブルに実行件数分のレコードが記録されていることを確認

## やってはいけないこと

- AI判定の実行を確定判定やAI素案生成に連動させて自動発火させない（CLAUDE.md規約7、ボタン起点を維持）
- AI判定の結果によって`status`を変更しない（あくまで気づきの提示。最終判断はSE）
- 辞書チェックとAI判定が互いの結果を上書きし合う実装にしない（Step1の`source`による入れ替え方式を維持する）

## 完了条件

- [ ] 辞書側・AI側ともに`source`によるフラグの入れ替え方式に修正済み
- [ ] `ambiguity_check_l2`プロンプト登録済み
- [ ] `runAmbiguousCheckAI`実装済み
- [ ] 辞書・AI両方の検出結果が共存することを確認済み
