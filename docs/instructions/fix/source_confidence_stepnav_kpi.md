# 指示書：出典・確度の可視化、ステップナビゲーション、KPI説明文

## 目的

参考UI（WHITEBOX）から着想を得て、以下4点を改善する。

1. 要件項目に「出典」（どの資料から来たか）をバッジ表示する
2. AIの「確度」（資料に明記されていたか／推測か）を可視化する
3. 章ページ下部に「前の章／次の章」のステップナビゲーションを追加する
4. KPIツリー（4章）の各階層に説明文を追加する

## 重要な前提：確度（confidence）はこれまで保存されていなかった

Phase1 Step5（AI素案生成）の時点で、AIの応答には`confidence`（`explicit`|`inferred`）が含まれていたが、`requirement_items`への保存時にこの値を書き込んでおらず、**データとして一度も保存されていなかった**。本Stepでまず列を追加し、以後生成される項目から保存を開始する（過去に生成済みの項目は`confidence`が`null`のままになる）。

## 前提確認

- テンプレートC列の精査（種別の章限定・区分の抽出品質改善）が完了していること

---

## Step 1: confidence列を追加し、AI素案生成時に保存する

```bash
supabase migration new add_confidence_column
```

```sql
alter table requirement_items add column if not exists confidence text check (confidence in ('explicit', 'inferred'));
```

`supabase db reset` で反映する。

`src/actions/ai-draft.ts`の`generateDraft`内、`requirement_items`への insert 部分に`confidence`を追加する。

```ts
.insert({
  project_id: projectId,
  tenant_id: tenantId,
  chapter_no: chapterNo,
  template_type: templateType,
  content: item.content,
  status: "ai_draft",
  ambiguous_flags: item.ambiguous ? [{ source: "extraction" as const, reason: item.ambiguous_text ?? undefined }] : [],
  confidence: item.confidence,
})
```

## Step 2: 出典・確度を取得できるようにする

`src/actions/requirement-items.ts`の`RequirementItem`型・`listRequirementItems`を修正する。

```ts
export type RequirementItem = {
  id: string;
  chapter_no: number;
  template_type: string;
  content: Record<string, string>;
  status: "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved";
  ambiguous_flags: AmbiguousFlag[];
  confidence: "explicit" | "inferred" | null;
  exception_reason: string | null;
  sources: { fileName: string; locationNote: string | null }[];
};

export async function listRequirementItems(projectId: string, chapterNo: number): Promise<RequirementItem[]> {
  const supabase = await createServerActionClient();
  const { data: items, error } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, template_type, content, status, ambiguous_flags, confidence, exception_reason")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .order("order_index", { ascending: true });
  if (error) throw error;
  if (!items || items.length === 0) return [];

  const { data: sourceLinks } = await supabase
    .from("item_sources")
    .select("item_id, location_note, source_documents(file_name)")
    .in("item_id", items.map((i) => i.id));

  const sourcesByItem = new Map<string, { fileName: string; locationNote: string | null }[]>();
  for (const link of sourceLinks ?? []) {
    const fileName = (link.source_documents as unknown as { file_name: string })?.file_name ?? "(不明)";
    const existing = sourcesByItem.get(link.item_id) ?? [];
    existing.push({ fileName, locationNote: link.location_note });
    sourcesByItem.set(link.item_id, existing);
  }

  return items.map((item) => ({
    ...item,
    sources: sourcesByItem.get(item.id) ?? [],
  }));
}
```

**注意**：`item_sources`の埋め込みJOIN（`source_documents(file_name)`）を使うため、CLAUDE.md規約37（参照先テーブルのRLS）に従い、`source_documents`に対する既存のSELECTポリシー（Phase1 Step1で整備済みのはず）が、この参照元（`item_sources`経由）でも機能するか確認すること。

## Step 3: RequirementTableに出典・確度バッジを追加

`src/components/domain/requirement-table/RequirementTable.tsx`の、ステータス列付近に追加する。

```tsx
<div className="px-3 py-2 flex items-center gap-1.5 flex-wrap">
  <StatusBadge status={item.status} />
  {item.confidence === "inferred" && (
    <span title="資料からの推測に基づく内容です" className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-faint">
      推測
    </span>
  )}
  {item.sources.length > 0 && (
    <span
      title={item.sources.map((s) => `${s.fileName}${s.locationNote ? `（${s.locationNote}）` : ""}`).join(", ")}
      className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-faint cursor-help"
    >
      出典 {item.sources.length}件
    </span>
  )}
  {/* 既存の曖昧表現バッジ等はそのまま続ける */}
</div>
```

## Step 4: 章ページにステップナビゲーションを追加

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`の末尾に追加する。

```tsx
const { data: project } = await supabase.from("projects").select("selected_chapters").eq("id", id).single();
const selectedChapters = ((project?.selected_chapters as number[]) ?? []).sort((a, b) => a - b);
const currentPos = selectedChapters.indexOf(chapterNum);
const prevChapter = currentPos > 0 ? selectedChapters[currentPos - 1] : null;
const nextChapter = currentPos >= 0 && currentPos < selectedChapters.length - 1 ? selectedChapters[currentPos + 1] : null;
```

```tsx
<div className="flex justify-between mt-6 pt-4 border-t border-border">
  {prevChapter ? (
    <Link href={`/projects/${id}/chapters/${prevChapter}`} className="text-sm text-secondary hover:text-primary">
      ← {prevChapter}. {CHAPTER_NAMES[prevChapter]}
    </Link>
  ) : <span />}
  {nextChapter ? (
    <Link href={`/projects/${id}/chapters/${nextChapter}`} className="text-sm text-secondary hover:text-primary">
      {nextChapter}. {CHAPTER_NAMES[nextChapter]} →
    </Link>
  ) : <span />}
</div>
```

**注意**：`selectedChapters`には4・10・15章（固定ルート）も含まれ得るため、リンク先がこれらの章番号の場合でも`/chapters/{n}`のURLで正しく専用ページに到達する（規約19、静的ルート優先）。

## Step 5: KPIツリーに階層の説明文を追加

`src/components/domain/kpi-tree/KpiTree.tsx`（または`src/actions/kpi-tree.ts`）に、階層ごとの説明文を追加する。

```ts
export const KPI_LEVEL_DESCRIPTIONS: Record<string, string> = {
  "ゴール": "達成したい最終的な状態",
  "目標": "ゴール達成のための具体的な指標",
  "戦略": "目標達成のための大きな方針",
  "戦術": "戦略を実行するための具体的な施策",
};
```

`renderNode`関数内、各ノードのレベル表示（`{node.content.level}`）の隣に、レベルラベルにマウスオーバーで説明文が出る`title`属性を追加する。

```tsx
<span
  className="text-[11px] text-faint w-10"
  title={KPI_LEVEL_DESCRIPTIONS[node.content.level]}
>
  {node.content.level}
</span>
```

## Step 6: 動作確認

1. いずれかの章でAI素案を再生成し、行に「推測」バッジ（資料に明記されていなかった項目のみ）が表示されることを確認する
2. 「出典 N件」バッジにマウスオーバーし、資料名が表示されることを確認する
3. 過去に生成済みの項目（`confidence`が`null`）では「推測」バッジが表示されない（エラーにもならない）ことを確認する
4. 章ページ下部に「前の章／次の章」が表示され、正しい章に遷移することを確認する。最初の章では「前の章」が、最後の章では「次の章」が表示されないことを確認する
5. KPIツリーのレベルラベルにマウスオーバーし、説明文が表示されることを確認する

## やってはいけないこと

- `confidence`が`null`（過去データ）の場合にエラーや不自然な表示（「null」という文字列表示等）にならないようにする
- 出典バッジの表示のために、既存の`item_sources`のデータ構造・RLSを変更しない（読み取りのみ）

## 完了条件

- [ ] `confidence`列追加・保存済み
- [ ] 出典・確度バッジ実装済み
- [ ] ステップナビゲーション実装済み
- [ ] KPIツリーの説明文実装済み
- [ ] 動作確認済み
