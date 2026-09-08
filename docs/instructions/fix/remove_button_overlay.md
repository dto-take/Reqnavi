# 指示書：ボタン操作時の全画面オーバーレイを無効化（ページ遷移時のみ残す）

## 目的

前回追加した「ボタン操作中に全画面オーバーレイを表示する」仕組みを取り除き、**ボタン操作時は既存のボタン内メッセージ（「生成中...」等）のみ**に戻す。**ページ遷移時のローディング画面（`loading.tsx`）はそのまま維持する**（今回の変更対象外）。

## 前提確認

- ローディングオーバーレイ背景の透明度再調整が完了していること

---

## Step 1: useGlobalPendingの呼び出し箇所を全て削除

```bash
grep -rln "useGlobalPending" src/components src/app
```

見つかった全ファイルから、`useGlobalPending(...)`の呼び出し行と、対応するimport文を削除する。想定される対象（実際にはgrep結果に従うこと）：

- `src/components/ui/submit-button.tsx`
- `src/components/domain/ai-generate-button.tsx`
- `src/components/domain/requirement-table/RequirementTable.tsx`
- `src/components/domain/kpi-tree/KpiTree.tsx`
- `src/components/domain/nonfunctional-checklist/ChecklistCard.tsx`
- `src/components/domain/business-flow/SwimlaneDiagramEditor.tsx`
- `src/components/domain/document-upload-zone.tsx`
- `src/components/domain/bulk-generate-zone.tsx`

**注意**：`useGlobalPending`の呼び出し行だけを削除し、各コンポーネント本来の`isPending`/`pending`の状態管理（`useTransition`・`useFormStatus`）自体は削除しない（ボタン内メッセージの表示に引き続き必要なため）。

## Step 2: LoadingOverlayProviderのラップを解除

`src/app/layout.tsx`から、`LoadingOverlayProvider`のimportとラップを削除する。

```tsx
<ToastProvider>{children}</ToastProvider>
```

## Step 3: 不要になったファイルを削除

`src/components/ui/loading-overlay.tsx`を削除する。削除前に`grep -rln "loading-overlay" src/`を実行し、他に参照している箇所が残っていないことを確認してから削除すること。

## Step 4: 動作確認

1. 「AI素案を生成」「曖昧表現チェック」等のボタンを押し、全画面オーバーレイが表示されず、これまで通りボタン内の文言（「生成中...」等）のみが変化することを確認する
2. ページ遷移（案件一覧→案件を開く等）では、引き続き`loading.tsx`によるブランドアイコンの全画面オーバーレイが表示されることを確認する（この動作は変更していないため、壊れていないことの確認）
3. `tsc --noEmit`・`eslint`でエラーが出ないことを確認する

## やってはいけないこと

- `loading.tsx`（ページ遷移用）や`BrandSpinner`、CSSアニメーション定義を削除・変更しない
- 各コンポーネントの`useTransition`/`useFormStatus`自体を削除しない（`useGlobalPending`の呼び出しのみを取り除く）

## 完了条件

- [ ] 全`useGlobalPending`呼び出し削除済み（grep確認込み）
- [ ] `LoadingOverlayProvider`のラップ解除済み
- [ ] `loading-overlay.tsx`削除済み
- [ ] ボタン操作時・ページ遷移時それぞれの動作確認済み
