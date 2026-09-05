# 指示書：ローディングオーバーレイの見た目調整（透明度・アニメーション）

## 目的

1. オーバーレイの背景をより半透明にする
2. 単純な回転アニメーションを、より洗練された「波紋（リング）が広がるパルス」アニメーションに変更する

## 前提確認

- 全体ローディングオーバーレイの実装が完了していること

---

## Step 1: アニメーションをCSSで定義し直す

`src/app/globals.css`の`spin-slow`関連の定義を、以下に置き換える（削除して新規追加でよい）。

```css
@keyframes brand-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.85; }
}
@keyframes brand-ripple {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(2); opacity: 0; }
}
.animate-brand-pulse {
  animation: brand-pulse 1.8s ease-in-out infinite;
}
.animate-brand-ripple {
  animation: brand-ripple 1.8s ease-out infinite;
}
```

## Step 2: BrandSpinnerを波紋+パルス表現に変更

`src/components/ui/brand-spinner.tsx`を以下に置き換える。

```tsx
export function BrandSpinner({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-brand/25 animate-brand-ripple" />
        <span
          className="absolute inset-0 rounded-full bg-brand/25 animate-brand-ripple"
          style={{ animationDelay: "0.6s" }}
        />
        <img src="/brand-icon.svg" alt="" className="relative w-8 h-8 animate-brand-pulse" />
      </div>
      <span className="text-sm text-secondary">{label}</span>
    </div>
  );
}
```

**注意**：波紋（リング）は2つ重ねて時間差（`animationDelay`）で表示することで、単調にならない層状の広がりを表現している。見た目のバランス（リングの大きさ・不透明度・アイコンの拡大率）は、実際に表示してみて微調整して構わない。

## Step 3: オーバーレイの透明度を上げる

以下の背景クラスを`bg-page/80`から`bg-page/40`に変更し、あわせて`backdrop-blur-sm`を`backdrop-blur-md`に変更する（透明度を上げる分、後ろの文字が透けて読みにくくならないよう、ぼかしを少し強める）。

- `src/app/loading.tsx`
- `src/app/projects/[id]/loading.tsx`
- `src/components/ui/loading-overlay.tsx`（`LoadingOverlayProvider`内のオーバーレイ表示部分）

```tsx
className="fixed inset-0 z-[9999] flex items-center justify-center bg-page/40 backdrop-blur-md"
```

## Step 4: 動作確認

1. ページ遷移時・ボタン操作時のオーバーレイで、背景の画面が透けて見える程度に半透明になっていることを確認する
2. アイコンが単純な回転ではなく、ゆっくり拡大縮小し、その周りに波紋が時間差で広がって消えていく表現になっていることを確認する
3. 見た目のバランスを確認し、気になれば数値を微調整する
4. 引き続き、背後の操作がブロックされていること（クリックが貫通しないこと）を確認する

## やってはいけないこと

- 波紋・パルスのアニメーション速度を極端に速く/遅くしない（目安として1.5〜2秒程度の周期）

## 完了条件

- [ ] アニメーションが波紋+パルス表現に変更済み
- [ ] オーバーレイの透明度が上がっていることを確認済み
- [ ] 見た目の最終調整済み
