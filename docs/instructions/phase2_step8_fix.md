# 指示書：Phase2 Step8 修正 曖昧フラグのsource不整合解消

## 目的

Phase1 Step5（AI素案生成）が書き込む`ambiguous_flags`が、Phase2 Step8で確定した`source`ベースの型と異なる古い形式のままになっている不整合を解消する。詳細は `docs/02_architecture.md` 5.3節（sourceの設計表）を参照。

## 前提確認

- Phase2 Step8（曖昧表現のAI判定）が完了していること

---

## Step 1: AmbiguousFlag型を3種類対応に拡張

`src/lib/ambiguous-phrases.ts`の`AmbiguousFlag`型を以下に置き換える。

```ts
export type AmbiguousFlag = {
  source: "dictionary" | "ai" | "extraction";
  field?: string;        // dictionary/ai判定時のみ（フィールド単位の判定）
  phrase?: string;       // dictionary判定時のみ
  reason?: string;       // ai/extraction判定時のみ
  matched_text?: string;
};
```

`src/actions/requirement-items.ts`の`RequirementItem.ambiguous_flags`の型もこれに合わせる（既に`AmbiguousFlag`を参照している場合は変更不要）。

## Step 2: ai-draft.ts の書き込み形式を修正

`src/actions/ai-draft.ts`の`generateDraft`内、`ambiguous_flags`を組み立てている箇所を以下に修正する。

```ts
// 修正前の形式（{ text: item.ambiguous_text }）を、AmbiguousFlag型に準拠させる
ambiguous_flags: item.ambiguous
  ? [{ source: "extraction" as const, reason: item.ambiguous_text ?? undefined }]
  : [],
```

## Step 3: 辞書チェック・AI判定のフィルタを汎用化

`src/actions/ambiguous-check.ts`の`runAmbiguousCheck`（辞書）内、既存フラグの絞り込みを修正する。

```ts
// 修正前: .filter((f) => f.source === "ai")
// 修正後（dictionary以外のsourceをすべて保持する）：
const existingOtherFlags = (item.ambiguous_flags ?? []).filter(
  (f: AmbiguousFlag) => f.source !== "dictionary"
);
const nextFlags = [...existingOtherFlags, ...dictionaryFlags];
```

同ファイルの`runAmbiguousCheckAI`内も同様に修正する。

```ts
// 修正前: .filter((f) => f.source === "dictionary")
// 修正後（ai以外のsourceをすべて保持する）：
const existingOtherFlags = (item.ambiguous_flags ?? []).filter(
  (f: AmbiguousFlag) => f.source !== "ai"
);
```

## Step 4: テーブルエディタのツールチップにextractionを追加

`src/components/domain/requirement-table/RequirementTable.tsx`の警告ツールチップ表示を修正する。

```tsx
title={item.ambiguous_flags
  .map((f) =>
    f.source === "dictionary" ? `[辞書] ${f.field}: 「${f.phrase}」`
    : f.source === "ai" ? `[AI] ${f.field}: ${f.reason}`
    : `[素案生成時] ${f.reason}`
  )
  .join(", ")}
```

## Step 5: 動作確認

1. 資料をアップロードし、9章等で「AI素案を生成」を実行し、資料の記述が曖昧だった項目に`extraction`由来のフラグが付くことを確認（ツールチップに`[素案生成時]`と表示される）
2. 同じ項目に対して「曖昧表現チェック」（辞書）を実行し、`extraction`のフラグが消えずに残ることを確認
3. 続けて「AI曖昧判定（詳細）」を実行し、`extraction`・`dictionary`のフラグが残ったまま`ai`のフラグが追加されることを確認（3種類が共存する状態）
4. いずれかを再実行した際、自分のsourceの結果だけが入れ替わり、他のsourceに影響しないことを確認

## やってはいけないこと

- `source`によるフィルタを`=== "特定の1つ"`という形で書かない（今回のバグの原因。「自分以外は保持する」という`!== "自分のsource"`の形で書く）

## 完了条件

- [ ] `AmbiguousFlag`型の拡張済み
- [ ] `ai-draft.ts`の書き込み形式修正済み
- [ ] 辞書・AI判定のフィルタが汎用化され、3種類のsourceが共存することを確認済み
