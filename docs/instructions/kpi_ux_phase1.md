# 指示書：KPI画面UX改善 フェーズ1（データモデル拡張・2ペインレイアウトへの置き換え）

## 目的

添付のデザインハンドオフ（`design_handoff_kpi_screen/README.md`）に基づき、4章（KPI）の編集画面を、現状の「階層が深いほど入力欄が狭くなる単一ツリー表示」から、**左＝構造ペイン（ツリー）／右＝編集ペイン**の2ペイン構成に置き換える。

**本フェーズの対象は「データモデル拡張」「2ペインレイアウトへの置き換え」「既存の編集・追加・削除機能の移植」のみ**とする。確定ワークフロー（フェーズ2）・AI候補生成（フェーズ3）・キーボード操作/階層変更/並べ替え（フェーズ4）は対象外とする。

## 重要な方針：デザイントークンの扱い

デザインハンドオフは独自の配色（緑・琥珀・Shippori Mincho/IBM Plex Mono等）を提案しているが、**ReqNaviは既存のデザインシステム（深緑系ブランドカラー・Inter一本化、規約38〜41）を優先する**。README自身も「既存プロダクトのデザインシステムが優先」と明記している。

- 緑（primary）・琥珀（要レビュー）・破線（AI由来）という**役割**はそのまま踏襲するが、**実際の値はReqNaviの既存トークンにマップする**
- **新しい書体は追加しない**。Inter一本化を維持する（要件定義画面UX改善フェーズ1と同じ方針）

## 前提確認

- 資料アップロードのファイルサイズ上限（20MB）の実装が完了していること
- ハンドオフの`KPI画面 4b 高精度デザイン.dc.html`を実際にブラウザで開き、2ペインの見た目・選択時の挙動を目視で確認してから着手すること

---

## Step 1: KPIノードのcontentフィールドを拡張

`requirement_items.content`はjsonb列のため、スキーマ変更は不要。以下のキーを新たに扱えるようにする。

```ts
type KpiNodeContent = {
  level: string;
  text: string;
  metric?: string;
  owner?: string;
  due_date?: string;
};
```

`src/actions/ai-draft-kpi.ts`（AI生成時）は既存の`{level, text}`のみの生成のままでよい。

## Step 2: 更新用Server Actionを追加

`src/actions/kpi-tree.ts`に、ノードの各フィールドを更新する関数を追加する。

```ts
export async function updateKpiNodeField(
  nodeId: string,
  projectId: string,
  field: "text" | "metric" | "owner" | "due_date",
  value: string
) {
  const supabase = await createServerActionClient();
  const { data: current, error: fetchError } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("id", nodeId)
    .single();
  if (fetchError || !current) throw fetchError ?? new Error("項目が見つかりません");

  const newContent = { ...(current.content as object), [field]: value };
  const { error } = await supabase
    .from("requirement_items")
    .update({ content: newContent })
    .eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/4`);
}
```

## Step 3: 2ペインレイアウトを実装

`src/components/domain/kpi-tree/KpiTree.tsx`を、以下の構成に作り直す（新規ファイルに分割してよい：`KpiTreePane.tsx`＋`KpiDetailPane.tsx`）。

**左：構造ペイン**
- ハンドオフの「B. 構造ペイン」節を参考にする（「未確定N」ピルは、本フェーズでは全ノードが`ai_draft`ステータスのため簡易表示でよい）
- ツリー行：開閉キャレット、種別ラベル、本文（1行省略表示）、選択中のハイライト
- 末尾に「＋ 目標を追加」等（既存の追加機能をこのUIに移植する）

**右：編集ペイン**
- パンくず（選択ノードの祖先を`parent_id`を辿って表示）
- 本文フィールド（クリックでインライン編集、`onBlur`で`updateKpiNodeField`を呼ぶ。フィールド幅は階層に依存しない、固定幅にする）
- 測定指標／担当・期限フィールド（同様にクリックで編集、未入力時は「＋ 未入力」）
- 「⋯」メニュー：削除・下位項目の追加（既存の削除・追加機能を移植）

**注意**：AI候補パネル・確定ボタンは本フェーズでは実装しない。

## Step 4: 動作確認

1. 4章を開き、左に構造ペイン（ツリー）、右に編集ペインの2ペイン構成で表示されることを確認する
2. ツリーのノードをクリックすると、右ペインが選択したノードの内容に切り替わることを確認する
3. パンくずが、選択ノードの祖先を正しく表示することを確認する
4. 本文・測定指標・担当・期限の各フィールドを編集し、`onBlur`で保存されることを確認する
5. 「＋ 目標を追加」等の既存の追加機能、「⋯」メニューからの削除が引き続き機能することを確認する
6. ツリーの開閉（キャレットクリック）が機能することを確認する

## やってはいけないこと

- 確定ワークフロー・AI候補生成・キーボード操作/並べ替えを本フェーズで実装しない
- 新しい書体を追加しない
- 既存の追加・削除機能を、2ペイン化の際に欠落させない

## 完了条件

- [ ] `content`フィールド拡張実装済み
- [ ] `updateKpiNodeField`実装済み
- [ ] 2ペインレイアウト実装済み
- [ ] 既存の追加・削除機能の移植確認済み
- [ ] 動作確認済み
