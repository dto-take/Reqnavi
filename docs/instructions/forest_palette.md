# 指示書：配色の切り替え（深緑系）・列幅の改善

## 目的

1. デザイントークンをNotion系(グレースケール中心)から、深緑(#1F4D3D)をブランドカラーとした配色に切り替える。「確定」ステータスとブランドカラーを同系統にすることで、サービスの本質（確信を持って進める）と色を結びつける。
2. 「内容」等、文字数が多くなりがちな列が他の列と同じ幅で表示され窮屈になっている問題を解消する。列ごとに「広め/普通」の幅の目安を持たせる。

デザインの微調整（正確な余白のpx値等）はお任せしてよいが、以下のトークン値・仕組みは指定通りに実装すること。

## 前提確認

- 見栄え向上・ローディング表示（Step1〜3）が完了していること

---

## Step 1: デザイントークンを更新

`src/app/globals.css`を以下のように更新する。

```css
@import "tailwindcss";

:root {
  --bg-page: #FFFFFF;
  --bg-sidebar: #FAF8F3;
  --bg-hover: #F1EFE8;
  --text-primary: #2B2A27;
  --text-secondary: #6B6960;
  --text-faint: #8F8D82;
  --border: #E5E1D8;
  --brand: #1F4D3D;

  --status-draft-bg: #EDEBE5;      --status-draft-text: #6B6960;
  --status-review-bg: #F5E6C8;     --status-review-text: #8A6215;
  --status-confirmed-bg: #DCEAE3;  --status-confirmed-text: #1F4D3D;
  --status-needhearing-bg: #F7E0DC; --status-needhearing-text: #A23B2E;
}

@theme inline {
  --color-page: var(--bg-page);
  --color-sidebar: var(--bg-sidebar);
  --color-hover: var(--bg-hover);
  --color-primary: var(--text-primary);
  --color-secondary: var(--text-secondary);
  --color-faint: var(--text-faint);
  --color-border: var(--border);
  --color-brand: var(--brand);
  --font-sans: var(--font-inter), sans-serif;
}

body {
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-inter), sans-serif;
}
```

**注意**：`--brand`を新設したのがポイント。以前は`--text-primary`（本文の文字色）をボタンの背景色としても流用していたため、文字色を変えるとボタンの色も連動して変わってしまう構造だった。ボタン用の色を独立させることで、今後どちらかだけを調整できるようにする。

## Step 2: Buttonコンポーネントをブランドカラーに対応させる

`src/components/ui/button.tsx`の`VARIANT_CLASSES`を修正する。

```ts
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand text-white hover:opacity-90 disabled:opacity-50",
  secondary: "border border-border text-primary hover:bg-hover disabled:opacity-50",
  ghost: "text-secondary hover:text-primary underline disabled:opacity-50 disabled:no-underline",
  danger: "text-[#A23B2E] hover:underline disabled:opacity-50",
};
```

`SubmitButton`・`AiGenerateButton`等、既に`Button`を内部で使っているコンポーネントは変更不要（自動的に反映される）。

## Step 3: 列ごとの幅の目安（width_hint）を追加

```bash
supabase migration new add_column_width_hint
```

```sql
alter table chapter_column_templates add column if not exists width_hint text default 'normal' check (width_hint in ('normal', 'wide'));

-- 文字数が多くなりやすい列を「wide」に設定
update chapter_column_templates
set width_hint = 'wide'
where column_key in ('detail', 'issue', 'solution', 'pros_cons', 'why', 'overview', 'external_if', 'field_definitions');
```

`supabase db reset` で反映する。

`src/actions/requirement-items.ts`の`ColumnDef`型と`listColumnDefs`を修正する。

```ts
export type ColumnDef = {
  column_key: string;
  label: string;
  data_type: string;
  order_index: number;
  width_hint: "normal" | "wide";
};
```

```ts
.select("column_key, label, data_type, order_index, applicable_chapters, width_hint")
```

## Step 4: RequirementTableの列幅計算をwidth_hintベースに変更

`src/components/domain/requirement-table/RequirementTable.tsx`の、`gridTemplateColumns`を計算している箇所を修正する。

```ts
// 修正前: style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) 100px 80px` }}
// 修正後（wideな列は2fr、通常列は1fr）:
const gridTemplate = columns.map((c) => (c.width_hint === "wide" ? "2fr" : "1fr")).join(" ") + " 100px 80px";
// 各 style={{ gridTemplateColumns: ... }} をこの gridTemplate を使う形に置き換える（ヘッダー行・データ行の両方）
```

## Step 5: テーブルを表示するページの横幅を広げる

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`等、テーブル表示が主体のページのコンテナ幅（`max-w-4xl`等）を、より広い`max-w-6xl`程度に変更し、列を広げた分の余白を確保する。他のテーブル系ページ（`readiness`・`consistency`・`changes`等）も、内容に応じて同様の調整を検討してよい（この部分の具体的な調整幅はお任せする）。

## Step 6: 動作確認

1. ログイン画面・案件一覧・章ページ等で、ボタンが深緑色になっていることを確認する
2. 「確定」ステータスバッジが、ブランドカラーと同系統の緑になっていることを確認する
3. 「内容」列（`detail`）を持つ章（例：6章・8章）で、その列が他の列より広く表示されることを確認する
4. 長文を入力したセルが、以前より折り返しが少なく読みやすくなっていることを確認する
5. 既存の全画面でレイアウト崩れが無いことを一通り確認する

## やってはいけないこと

- `--text-primary`をボタンの背景色として再利用する実装に戻さない（Step1で分離した`--brand`を必ず使う）
- `width_hint`を全列に`wide`を設定して意味を無くさない（本当に長文になりやすい列のみに限定する）

## 完了条件

- [ ] デザイントークンを深緑系に更新済み
- [ ] Buttonコンポーネントがブランドカラーを使うよう修正済み
- [ ] `width_hint`列追加・該当列への設定済み
- [ ] `RequirementTable`が`width_hint`に応じた列幅で表示されることを確認済み
- [ ] 主要画面での視覚的な確認済み
