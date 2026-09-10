# 指示書：KPI画面UX改善 フェーズ3（ノード単位のAI候補生成）

## 目的

選択中のノードの「1つ下の階層」の候補を、根拠付きでAIに提案させ、採用/見送りできるようにする（ゴール→目標候補／目標→戦略候補／戦略→戦術候補／戦術→測定指標候補）。

## 重要な設計判断：候補はDBに永続化しない（スコープの簡略化）

デザインハンドオフは候補データをサーバー側の`Candidate`エンティティとして管理し、見送った候補も記録して再生成時に重複を避ける設計を提案している。**本フェーズではこれを簡略化し、候補は画面表示中のみ保持する一時的な状態（Reactの状態）とし、新しいテーブルは作らない**。

- 「見送り」はその場でリストから消すだけで、DBには何も記録しない
- 「別の案を出す」は、直前に表示していた候補の文言をプロンプトに「除外リスト」として渡すことで、簡易的に重複を避ける

## 前提確認

- KPI画面UX改善 フェーズ2（確定ワークフロー）が完了していること

---

## Step 1: AI候補生成プロンプトを登録

```sql
insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('suggest_kpi_children', 'D', 'v1',
'あなたはSIerの要件定義支援AIです。以下のKPIツリーの文脈をもとに、指定された階層の候補を3件（測定指標の場合は2件）提案してください。

各候補には、なぜその内容が妥当かという「根拠」を1文必ず添えてください。

【現在選択されているノード（{current_level}）】
{current_text}

【祖先の文脈】
{ancestor_chain}

【同じ階層の他のノード（重複を避けるため）】
{sibling_texts}

【他章の確定済み内容（参考）】
{other_chapter_context}

【今回除外してほしい候補（既に提示済み・却下済み）】
{exclude_texts}

提案する階層：{target_level}

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{"candidates": [{"text": "候補の内容", "why": "根拠"}]}',
true);
```

## Step 2: 候補生成のServer Actionを作成

`src/actions/kpi-tree.ts`に追加する。

```ts
const LEVEL_ORDER = ["ゴール", "目標", "戦略", "戦術", "測定指標"];

export async function suggestKpiCandidates(
  nodeId: string,
  projectId: string,
  excludeTexts: string[]
): Promise<{ text: string; why: string }[]> {
  const supabase = await createServerActionClient();

  const { data: node } = await supabase.from("requirement_items").select("content, parent_id").eq("id", nodeId).single();
  if (!node) throw new Error("項目が見つかりません");

  const currentLevel = (node.content as { level: string }).level;
  const targetLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevel) + 1] ?? "測定指標";

  const ancestorChain: string[] = [];
  let parentId = node.parent_id;
  while (parentId) {
    const { data: parent } = await supabase.from("requirement_items").select("content, parent_id").eq("id", parentId).single();
    if (!parent) break;
    ancestorChain.unshift((parent.content as { text: string }).text);
    parentId = parent.parent_id;
  }

  const { data: siblings } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", 4)
    .neq("id", nodeId);
  const siblingTexts = (siblings ?? [])
    .filter((s) => (s.content as { level: string }).level === currentLevel)
    .map((s) => (s.content as { text: string }).text);

  const { data: otherChapterItems } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("status", "confirmed")
    .neq("chapter_no", 4)
    .limit(10);
  const otherChapterContext = (otherChapterItems ?? [])
    .map((i) => (i.content as Record<string, string>).detail ?? (i.content as Record<string, string>).name ?? "")
    .filter(Boolean)
    .join("\n");

  const { id: promptId, body: promptBody } = await getActivePrompt("suggest_kpi_children");
  const filledPrompt = promptBody
    .replace("{current_level}", currentLevel)
    .replace("{current_text}", (node.content as { text: string }).text)
    .replace("{ancestor_chain}", ancestorChain.join(" > "))
    .replace("{sibling_texts}", siblingTexts.join("\n"))
    .replace("{other_chapter_context}", otherChapterContext || "（特になし）")
    .replace("{exclude_texts}", excludeTexts.join("\n") || "（なし）")
    .replace("{target_level}", targetLevel);

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({ model: "gemini-3.6-flash", contents: filledPrompt })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = z.object({ candidates: z.array(z.object({ text: z.string(), why: z.string() })) }).safeParse(JSON.parse(cleaned));

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { node_id: nodeId, target_level: targetLevel },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) throw new Error("AIの出力形式が不正でした。");
  return parsed.data.candidates;
}
```

**注意**：使用するGeminiのモデル名は、その時点でコードベース内の他のGemini呼び出し箇所が使っている実際の値に合わせること。

## Step 3: 採用処理を実装

`src/actions/kpi-tree.ts`に追加する。

```ts
export async function adoptKpiCandidate(
  nodeId: string,
  projectId: string,
  tenantId: string,
  candidateText: string
) {
  const supabase = await createServerActionClient();
  const { data: node } = await supabase.from("requirement_items").select("content").eq("id", nodeId).single();
  if (!node) throw new Error("項目が見つかりません");

  const currentLevel = (node.content as { level: string }).level;

  if (currentLevel === "戦術") {
    await updateKpiNodeField(nodeId, projectId, "metric", candidateText);
    return null;
  }

  const targetLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevel) + 1];
  const newNodeId = await createKpiNode(projectId, tenantId, nodeId, targetLevel, candidateText, "ai_draft");
  revalidatePath(`/projects/${projectId}/chapters/4`);
  return newNodeId;
}
```

**注意**：`createKpiNode`の実際のシグネチャを、フェーズ1・2の実装で確認してから合わせること。AI候補から採用したノードは`ai_draft`ステータスにし、既存の「AI素案」バッジがそのまま機能するようにする。

## Step 4: AI候補パネルのUIを実装

`src/components/domain/kpi-tree/KpiDetailPane.tsx`に、AI候補パネルを追加する。

- 候補は`useState`で保持する（DBに保存しない）
- 「〈子種別〉候補を出す」ボタン：`suggestKpiCandidates`を呼び、結果を候補リストにセットする（生成中はスケルトン表示）
- 候補カード：本文＋根拠、「採用」「見送り」
  - 「採用」：`adoptKpiCandidate`を呼び、候補をリストから削除する。子ノードが作成された場合は、そのノードを選択状態にする
  - 「見送り」：候補をリストから削除するのみ
- 「すべて採用」：残っている候補を順に採用する
- 「別の案を出す」：現在表示中の候補の`text`一覧を`excludeTexts`として渡し、`suggestKpiCandidates`を再度呼ぶ
- 確定済み（`isItemLocked`）ノードを選択中は、AI候補パネル自体を表示しない

## Step 5: 動作確認

1. ゴールノードを選択し「目標候補を出す」を実行、3件の候補（根拠付き）が表示されることを確認する
2. 候補を「採用」し、選択ノードの子として`ai_draft`ステータスのノードが作成され、そのノードが選択状態になることを確認する
3. 「見送り」で候補がリストから消え、DBには何も記録されないことを確認する
4. 「別の案を出す」で、直前の候補とは異なる内容が生成される傾向にあることを確認する
5. 戦術ノードを選択して候補を出すと、「採用」時に新しいノードではなく、そのノードの測定指標フィールドに文言が書き込まれることを確認する
6. 確定済みノードを選択した際、AI候補パネルが表示されないことを確認する
7. 「すべて採用」で、残りの候補が順番に子ノードとして作成されることを確認する

## やってはいけないこと

- 候補データを保存する新しいテーブルを作らない
- 確定済みノードに対してAI候補パネルを表示・操作可能にしない

## 完了条件

- [ ] AI候補生成プロンプト登録済み
- [ ] `suggestKpiCandidates`実装済み
- [ ] `adoptKpiCandidate`実装済み
- [ ] AI候補パネルUI実装済み
- [ ] 動作確認済み
