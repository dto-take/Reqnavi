# 指示書：UX改善6項目（展開前対応）

## 目的

1. サイドバーの「要件定義」セクションを折りたたみ可能にする
2. 案件トップ画面のクイックリンクを「次にやるべきこと」中心に簡素化する
3. 項目が0件の章に、空の表を表示する代わりに案内メッセージを表示する
4. 「Salesforce機能を提案」ボタンにローディング表示を追加する
5. サイドバーの章ステータスドットに凡例を追加する
6. 章ページのボタンに視覚的な優先順位（主要/副次）を付ける

## 前提確認

- ドラッグ&ドロップの挿入位置インジケーターが完了していること

---

## Step 1: サイドバーの「要件定義」セクションを折りたたみ可能にする

`src/app/projects/[id]/layout.tsx`の「要件定義」セクションを、HTML標準の`<details>`/`<summary>`でラップする（JSの状態管理を追加せずに実現できる）。

```tsx
<details open>
  <summary className="text-[11px] text-faint mb-1 mt-3 cursor-pointer select-none">要件定義</summary>
  <div className="flex flex-col gap-0.5 mb-4">
    {/* 既存の章リンク一覧をそのままこの中に配置 */}
  </div>
</details>
```

「確定判定」「案件管理」の各セクションも、同様に`<details open>`でラップしてよい（お任せする）。

## Step 2: 案件トップ画面のクイックリンクを簡素化

`src/app/projects/[id]/page.tsx`の`QUICK_LINKS`グリッド表示を削除し、「次にやるべきこと」のカードのみを主役にする。画面末尾に「その他の機能はサイドバーからご利用いただけます」という一文だけ添える程度でよい。

## Step 3: 項目0件の章に案内メッセージを表示

`src/components/domain/requirement-table/RequirementTable.tsx`の先頭に、以下の分岐を追加する（既存の表描画ロジックより前に判定する）。

```tsx
if (items.length === 0) {
  return (
    <div className="border border-dashed border-border rounded-lg py-10 text-center">
      <p className="text-sm text-secondary mb-3">まだこの章に項目がありません</p>
      <p className="text-xs text-faint">「AI素案を生成」または「+ 行を追加」から始めてください</p>
    </div>
  );
}
```

**注意**：この分岐を追加すると、テーブルヘッダー（列見出し）ごと非表示になる。ヘッダーだけ表示してデータ行のみ空、という見せ方にしたい場合は、この文言をテーブルヘッダーの下・データ行の代わりに表示する形に調整してもよい（お任せする）。

## Step 4: Salesforce機能提案ボタンにローディング表示を追加

`RequirementTable.tsx`に、どの項目の提案が実行中かを追跡するstateを追加する。

```tsx
const [suggestingItemId, setSuggestingItemId] = useState<string | null>(null);

function handleSuggest(item: RequirementItem) {
  setSuggestingItemId(item.id);
  startTransition(async () => {
    await suggestPlatformFeature(item.id, projectId, chapterNo);
    setSuggestingItemId(null);
  });
}
```

該当ボタンにスピナーを追加する。

```tsx
<button
  disabled={isPending}
  onClick={() => handleSuggest(item)}
  className="text-xs text-secondary underline flex items-center gap-1"
>
  {suggestingItemId === item.id && <Spinner />}
  Salesforce機能を提案
</button>
```

`Spinner`は`src/components/ui/spinner.tsx`（既存）をimportして使う。

## Step 5: サイドバーの章ステータスドットに凡例を追加

`src/app/projects/[id]/layout.tsx`の全体進捗バーの下あたりに、小さな凡例を追加する。

```tsx
<div className="flex items-center gap-2 text-[9px] text-faint mb-3">
  <span className="flex items-center gap-1"><span style={{backgroundColor: "var(--status-draft-text)"}} className="w-1.5 h-1.5 rounded-full inline-block" />未着手</span>
  <span className="flex items-center gap-1"><span style={{backgroundColor: "var(--status-review-text)"}} className="w-1.5 h-1.5 rounded-full inline-block" />進行中</span>
  <span className="flex items-center gap-1"><span style={{backgroundColor: "var(--status-confirmed-text)"}} className="w-1.5 h-1.5 rounded-full inline-block" />確定</span>
</div>
```

## Step 6: 章ページのボタンに優先順位を付ける

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`のボタン群のvariantを見直す。

- 「AI素案を生成」（`AiGenerateButton`）：主要ボタンのまま維持（変更不要）
- 「曖昧表現チェック」「AI曖昧判定（詳細）」「他案件から参照」「+ 行を追加」：`Button`/`SubmitButton`の`variant`を`secondary`に統一する（現状`primary`になっている箇所があれば変更する）

```tsx
<SubmitButton variant="secondary" pendingText="チェック中...">曖昧表現チェック</SubmitButton>
```

**注意**：対象ボタンを`grep -rn "SubmitButton\|<Button" src/app/projects/\[id\]/chapters`で洗い出し、`AiGenerateButton`以外の全てが`secondary`（または`ghost`）になっているか確認すること。

## Step 7: 動作確認

1. サイドバーの「要件定義」見出しをクリックし、章リストが折りたたまれる/展開されることを確認する
2. 案件トップ画面が、「次にやるべきこと」中心のシンプルな構成になっていることを確認する
3. 項目0件の章を開き、案内メッセージが表示されることを確認する。「AI素案を生成」実行後、項目が表示されればメッセージが消えることを確認する
4. 「Salesforce機能を提案」を押した項目にのみスピナーが表示され、他の行には影響しないことを確認する
5. サイドバーに凡例が表示され、ドットの色と対応していることを確認する
6. 章ページで「AI素案を生成」だけが目立つ主要ボタンになっており、他のボタンが控えめな見た目になっていることを確認する
7. 既存の全機能に退行が無いことを確認する

## やってはいけないこと

- 折りたたみ機能のために新しい状態管理ライブラリやクライアントコンポーネント化を追加しない（`<details>`のようなHTML標準機能で完結させる）
- クイックリンクの削除によって、既存ページへのURL自体（サイドバーからの導線）を無くさない（あくまでトップ画面の表示を整理するだけ）

## 完了条件

- [ ] サイドバーの折りたたみ実装済み
- [ ] 案件トップ画面の簡素化済み
- [ ] 項目0件時の案内表示実装済み
- [ ] Salesforce機能提案のローディング表示実装済み
- [ ] ステータス凡例実装済み
- [ ] ボタンの優先順位（variant見直し）実装済み
- [ ] 全項目の動作確認済み
