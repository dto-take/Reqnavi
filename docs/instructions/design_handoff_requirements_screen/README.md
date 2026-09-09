# Handoff: 案件要件定義画面（章ページ）のUX改善 — 案 3a

## Overview

コンサル案件の要件定義を章立て（1. お客様概要 〜 15. 進捗）で作成・レビューするWebアプリの、**各章ページ（例：5. システム要件）** の改修デザイン。

現状は「課題・要望／ソリューション／KPI／メリット・デメリット／ステータス」の横長テーブルで、
- 行アクション（確定／リスク許容で確定／不採用にする／削除／この項目を確認）が素のリンクの縦積みで押しづらい
- 未入力の列が多く、横に広い割に空欄だらけ
- AI素案・出典・曖昧表現のバッジの意味と操作が不明瞭
- 1行の情報量が多く縦に長い
- 一括操作がない、レビュー状態が読み取れない

という問題があった（`reference_現状画面.png` 参照）。

改修方針（採用案 = **3a**）:
- テーブルを廃し **1項目 = 1カード** のリストにする
- カードを **グループ見出し（要件区分）** で束ね、**グループ内はドラッグで手動並び替え**。並び順は成果物の掲載順を意味する
- 主アクションは1つ（`確定する`）＋副次アクションは `⋯` メニューに格納
- **チェックボックス選択 → 上部に一括操作バー**（一括で確定／グループを変更／不採用にする）
- グループ見出しに件数と「未確定 N」を出し、**折りたたんでも進捗が読める**
- ステータス／曖昧表現でのフィルタ。**絞り込んでもグループの区切りは保持**する
- 左ナビは「章 ＋ その章のグループ」の2階層目次。章末に「この章を完了して次へ」

全15章が同じ構成なので、この画面骨格は章コンポーネントとして共通化する前提。

## About the Design Files

このバンドルに含まれるHTMLは **HTMLで作成したデザインリファレンス（プロトタイプ）** であり、そのまま本番に投入するコードではない。意図した見た目と挙動を示すものなので、**対象コードベースの既存環境（React / Vue / Rails+ERB など）と既存のパターン・ライブラリで作り直す** ことがタスク。環境がまだない場合は、プロジェクトに最適なフレームワークを選定した上で実装してよい。

HTML内のクラスレスなインラインスタイル・独自ランタイム（`support.js`）はプレビュー用の仕組みであり、実装で真似する必要はない。値（色・サイズ・余白・コピー）だけを取り出して使うこと。

ファイル:
- `要件画面 3a 高精度デザイン.dc.html` — **実装対象**（高精度）。ブラウザで直接開ける。
- `要件画面UXワイヤーフレーム.dc.html` — 検討過程の低精度ワイヤー6+3案（1a/1b/1c、2a/2b/2c、3a/3b/3c）。3a が採用案。他案は「なぜこの形か」の背景として参照。
- `reference_現状画面.png` — 改修前スクリーンショット。
- `support.js` — プレビュー用ランタイム（HTMLを開くために必要。実装には不要）。

## Fidelity

**High-fidelity（hifi）**。`要件画面 3a 高精度デザイン.dc.html` は最終的な配色・タイポグラフィ・余白・状態遷移を持つ。既存コードベースのコンポーネントライブラリを使いつつ、下記トークン通りの見た目で再現すること。

ただし **既存プロダクトのデザインシステムが優先**。トークンが既にあるならそちらにマップする（例：緑=primary、琥珀=warning、赤茶=danger/attention）。

添付ワイヤー（`要件画面UXワイヤーフレーム.dc.html`）は lofi。構造・フローの参考のみ。

## Screens / Views

### 画面: 章ページ（要件定義 各章 / 例 5. システム要件）

**Purpose**
- 作成者（コンサル・提案担当）: 章内の要件項目を追加・編集し、AI素案を採用し、曖昧表現を解消して確定させる
- 確認者（PM・レビュー担当）: 未確定・曖昧表現のある項目を見つけ、まとめて確定／差し戻す

**Layout**（ルート）
- `display:grid; grid-template-columns: minmax(200px,244px) minmax(0,1fr); min-height:100vh`
- 背景 `#f2efe7`
- 左: サイドナビ（`position:sticky; top:0; height:100vh; overflow:auto`、背景 `#1b1a17`）
- 右: メイン（`display:flex; flex-direction:column; min-width:0`）
- 幅は固定しない。メイン内のカードは流動幅で折り返す（`flex-wrap:wrap` / `grid-template-columns: repeat(auto-fit, minmax(180px,1fr))`）

---

#### A. サイドナビ（幅 200–244px, 背景 #1b1a17, 文字 #efeae0）

1. **案件ヘッダー** — padding `20px 18px 16px`、下境界 `1px solid rgba(239,234,224,.14)`、`gap:10px`
   - 「← 案件一覧」: IBM Plex Mono 500 / 11px / letter-spacing `.1em` / `#a8a294`
   - 案件名「Salesforce導入支援」: Shippori Mincho 600 / 17px / line-height 1.35 / `#fff`（2行改行）
   - 全体進捗: バー高さ4px、トラック `rgba(239,234,224,.18)`、フィル `#8fbf9f`、`border-radius:3px`、右に「11%」（IBM Plex Mono 500 / 11px / `#c9c3b5`）

2. **セクションラベル「要件定義」** — padding `16px 18px 6px`、IBM Plex Mono 500 / 10.5px / letter-spacing `.14em` / `#8d8778`

3. **章リスト** — 各行 padding `8px 10px`、`border-radius:7px`、`gap:10px`
   - 状態ドット 6px 円: 確定済章 `#8fbf9f` / 進行中章 `#e2a851` / 未着手章 `#5d584c`
   - 章名: Zen Kaku Gothic New 400 / 13px / `#c9c3b5`
   - **現在章**: 背景 `#2b2924`、`border-radius:8px`、padding `9px 10px`、章名は 700 / 13px / `#fff`。配下に **その章のグループ目次** を `padding-left:16px` でインデントし、`グループ名（400/12px/#d5cfc1）` ＋ 右端に `確定数/総数`（IBM Plex Mono 400 / 10.5px / `#8d8778`）
   - 末尾「9〜15章を表示 ▾」400 / 11.5px / `#8d8778`
   - グループ名クリックでメイン側の該当グループへスクロール（同一章内）／別章名クリックでその章へ遷移

4. **フッター** — `margin-top:auto`、上境界 `1px solid rgba(239,234,224,.14)`、padding `14px 16px 18px`
   - 「確定判定ダッシュボード」: 背景 `#efeae0`、文字 `#1b1a17`、500 / 12.5px、`border-radius:7px`、padding `10px 12px`、中央寄せ
   - 「整合性チェック（全体）」: 400 / 12px / `#a8a294`

---

#### B. メインヘッダー（背景 #faf8f3, 下境界 1px solid #e3ded2, padding 22px 28px 0）

1行目（`display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap`）
- 左: 「CHAPTER 05 / 15」IBM Plex Mono 500 / 11px / letter-spacing `.14em` / `#6f6a5e`、その下に章名 `<h1>`「システム要件」Shippori Mincho 600 / 27px / line-height 1.25 / letter-spacing `.01em` / `#1b1a17`
- 右（`margin-left:auto`）:
  - **進捗ピル**: 白背景 / `1px solid #e3ded2` / `border-radius:9px` / padding `7px 12px` / `gap:9px`。「確定」(Mono 400/11px/`#6f6a5e`) ＋ 「2/5」(Mono 500/14px、分母は `#b3ac9c`) ＋ 幅56px・高さ4pxのバー（トラック `#e8e3d8`、フィル `#2f5d45`）
  - `他案件から参照` — 白ボタン: 500/12.5px、文字 `#3c382f`、`1px solid #d8d2c4`、`radius 9px`、padding `11px 14px`。hover: 背景 `#f4f1e9` / 枠 `#c3bcab`
  - `グループ：要件区分 ▾` — 同スタイル。押すと軸を循環（要件区分 → ステータス → 優先度 → なし）。実装ではドロップダウンにするのが望ましい
  - `AI素案を生成` — primary: 背景 `#2f5d45`、文字 `#fff`、`radius 9px`、padding `11px 16px`、`box-shadow 0 1px 2px rgba(27,26,23,.14)`。hover 背景 `#254a37`

2行目（フィルタ行、`padding-bottom:14px`, `gap:10px`, `flex-wrap:wrap`）
- 全選択チェックボックス（17px相当、下記チェックボックス仕様）＋ ラベル「全選択」400/12px/`#6f6a5e`
- 区切り: `width:1px; height:18px; background:#e3ded2`
- **フィルタチップ**（4つ、単一選択）: 500/12px、`border-radius:20px`、padding `8px 14px`、数値部分のみ IBM Plex Mono
  - 非選択: 背景 `#fff` / 文字 `#3c382f` / 枠 `1px solid #d8d2c4`
  - 選択中: 背景 `#1b1a17` / 文字 `#f6f3ec` / 枠 `#1b1a17`
  - ラベルと件数: `すべて 5` / `要対応 <未確定数>` / `曖昧表現 2` / `確定 <確定数>`
- 右端注記「絞り込んでもグループの区切りは残ります」400/11.5px/`#6f6a5e`、`white-space:nowrap`

---

#### C. 一括操作バー（選択が1件以上のときのみ表示）

- `position:sticky; top:0; z-index:5`、背景 `#1b1a17`、文字 `#f6f3ec`、padding `11px 28px`、`gap:14px`、`flex-wrap:wrap`
- `box-shadow: 0 2px 8px rgba(27,26,23,.18)`
- 出現アニメーション: `opacity 0→1` ＋ `translateY(6px)→0`、`180ms ease`
- 左: 「**N** 件を選択中」500/13px（数値は Mono）
- 右（`margin-left:auto`、`gap:8px`）:
  - `一括で確定` — 背景 `#8fbf9f`、文字 `#1b1a17`、500/12px、`radius 7px`、padding `9px 14px`、hover `#a6cfb4`
  - `グループを変更 ▾`、`不採用にする` — 透明背景、枠 `1px solid rgba(246,243,236,.42)`、文字 `#f6f3ec`、hover 背景 `rgba(246,243,236,.1)`
  - `選択解除` — テキストボタン、400/12px、`#b8b1a1`

---

#### D. 本文（padding 22px 28px 40px, グループ間 gap 26px）

**グループ見出し**（`display:flex; align-items:center; gap:11px; flex-wrap:wrap`）
- 開閉キャレット `▾ / ▸` — Mono 400/11px / `#6f6a5e`、透明ボタン
- グループ選択チェックボックス（16px）— チェック状態は全選択 `✓` / 一部選択 `–` / 未選択 空
- グループ名 `<h2>` — Shippori Mincho 600 / 15px / letter-spacing `.02em` / `#1b1a17`
- 件数 —「2件」Mono 400/11px / `#6f6a5e`
- 状態ピル（`border-radius:20px`, padding `4px 10px`, 500/11px）
  - 未確定あり: 文字 `#8a5a18` / 背景 `#fbf1de` / 枠 `1px solid #ebd7b0` — 「未確定 N」
  - 全確定: 文字 `#2f5d45` / 背景 `#eaf1ec` / 枠 `1px solid #cfd9d2` — 「すべて確定」
- 右端 `この束を一括確定` — 文字 `#2f5d45` / 背景 `#fff` / 枠 `1px solid #cfd9d2` / `radius 7px` / padding `8px 12px` / 500/11.5px、hover 背景 `#f0f5f1`
- グループ見出し自体もドラッグで並び替え可（章の構成順を決める）

**項目カード（展開形 = 主要な形）**
- `background:#faf8f3`、`border:1px solid #e3ded2`、**左端 4px の状態カラー**、`border-radius:12px`、padding `16px 18px`、`box-shadow: 0 1px 2px rgba(27,26,23,.05)`、`display:flex; gap:14px`
- 左レール（`flex:none`, `gap:10px`）: チェックボックス17px、ドラッグハンドル `⠿`（Mono 13px / `#b3ac9c` / `cursor:grab`）
- 右本体（`flex:1; min-width:0; gap:12px`）:
  1. **バッジ行**（`gap:8px; flex-wrap:wrap`、各 `border-radius:20px`, padding `5px 11px`, 500/11px, `white-space:nowrap`）
     - ステータス: 要レビュー（`#8a5a18` / `#fbf1de` / 枠 `#ebd7b0`）／下書き（`#6f6a5e` / `#fff` / 枠 `#e3ded2`）／✓ 確定済（`#2f5d45` / `#eaf1ec` / 枠 `#cfd9d2`）
     - 「曖昧表現 1」: `#8f3a22` / `#fbeae5` / 枠 `1px solid #efcbc0`（クリックで該当箇所へ）
     - 「AI素案」: `#6f6a5e` / `#fff` / **枠 `1px dashed #cdc6b6`**（＝AI由来を破線で区別）
     - 「出典 2」: `#6f6a5e` / `#fff` / 枠 `1px solid #e3ded2`
     - 右端メタ「更新 3分前 · 田中」Mono 400/11px / `#7a7466`
  2. **本文（課題・要望）** — Zen Kaku Gothic New 500 / 15.5px / line-height 1.75 / `#1b1a17` / `text-wrap:pretty`
     - **曖昧表現のインラインマーク**: 背景 `#fbeae5`、`border-bottom:2px solid #cf7f66`、padding `1px 2px`（クリックで言い換え候補を出す）
  3. **項目サマリ** — 上境界 `1px solid #ece7dc`、padding `13px 0 3px`、`display:grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap:14px`
     - 各ラベル: IBM Plex Mono 500 / 10.5px / letter-spacing `.1em` / `#6f6a5e` — `SOLUTION` / `KPI` / `MERIT / DEMERIT`
     - 値あり: 400 / 13.5px / line-height 1.7 / `#3c382f`
     - **未入力**: 「＋ 未入力」400/12.5px / `#6f6a5e` / `border:1px dashed #cdc6b6` / `radius 7px` / padding `8px 11px` / `align-self:flex-start` / `cursor:pointer` — 空セルではなく入力の入口にする（旧テーブルの空欄問題の解決点）
  4. **アクション行**（`gap:9px; flex-wrap:wrap`）
     - 未確定時: `確定する` — primary 背景 `#2f5d45` / 文字 `#fff` / 500/13px / `radius 8px` / padding `11px 18px`、hover `#254a37`
     - 確定後: 「✓ 確定済（3分前）」— 文字 `#2f5d45` / 背景 `#eaf1ec` / 枠 `1px solid #cfd9d2` / padding `11px 16px`（ボタンではなく状態表示）
     - `開いて編集` — 白ボタン（枠 `#d8d2c4`、hover `#f4f1e9`）
     - `⋯` — 白ボタン、Mono 500/13px。中身: **リスク許容で確定 / 不採用にする / この項目を確認 / 削除**
     - 右端注記「⋯：リスク許容で確定／不採用／削除」400/11.5px / `#6f6a5e`（実装では不要な補助テキスト。運用開始後は削除可）

**項目カード（1行形）** — 未着手や確定済など詳細不要な項目
- 同じ枠・角丸で `display:flex; align-items:center; gap:14px`、padding `14px 18px`
- `⠿` ＋ 本文（500 / 14.5px / line-height 1.6、確定済は 400 / `#4a463c`）＋ 入力充足「1/4」（Mono 11px / `#7a7466`）＋ 右端 `開く` ボタン
- 確定済カードは背景 `#f7f5ee`、左端 `#2f5d45`

**折りたたみ中グループのプレースホルダ**
- `border:1px dashed #d8d2c4`、`radius 10px`、背景 `#f7f4ec`、padding `13px 18px`、`cursor:pointer`
- 「2件を折りたたみ中」400/12.5px/`#6f6a5e` ＋ 「曖昧表現 1件を含む」400/11.5px/`#8f3a22` ＋ 右端「開く ▾」500/12px/`#2f5d45`

**行追加**
- `＋ このグループに項目を追加` — 全幅、`border:1px dashed #cdc6b6`、`radius 10px`、padding `13px`、左padding `18px`、文字 `#6f6a5e` 400/12.5px、hover: 背景 `#faf8f3` / 文字 `#2f5d45` / 枠 `#a9c3b4`

**章フッター**
- 上境界 `1px solid #e3ded2`、`padding-top:12px`、`display:flex; justify-content:space-between; flex-wrap:wrap`
- 左: `← 4. KPI` 500/13.5px / `#3c382f`
- 右: 「未確定 N 件」400/11.5px / `#6f6a5e` ＋ `この章を完了して 6. 開発スコープ →`（背景 `#1b1a17` / 文字 `#fff` / 500/13px / `radius 9px` / padding `12px 18px`、hover `#33302a`）

**チェックボックス仕様（共通）**
- 16–17px 正方、`border:1.5px solid #b3ac9c`、`border-radius:4px`、背景 `#fff`
- チェック時は中央に `✓`（500/11px、`#2f5d45`）、一部選択は `–`
- ネイティブ input を隠すか、アクセシブルなカスタムチェックボックスとして実装（`role="checkbox"` / `aria-checked`）

## Interactions & Behavior

1. **行選択** — カード左のチェックボックス。1件以上選択で一括操作バーが sticky で出現（`rise` 180ms ease）。`選択解除` で全解除。
2. **全選択** — ヘッダーのチェックボックスで表示中（フィルタ後）の全件をトグル。
3. **グループ選択** — グループ見出しのチェックボックスでそのグループの全件をトグル。一部選択時は `–` 表示。
4. **一括で確定** — 選択中の全項目を確定済に。ステータスバッジ・左端カラー・進捗ピル・グループの「未確定 N」・左ナビの `確定数/総数`・「要対応」チップ件数・フッターの「未確定 N 件」がすべて即時更新。実行後は選択解除。
5. **この束を一括確定** — グループ内の未確定項目をすべて確定。
6. **確定する（単票）** — そのカードのみ確定。ボタンは「✓ 確定済（3分前）」の状態表示に置き換わる。
7. **フィルタチップ** — 単一選択。`すべて` / `要対応`（未確定のみ） / `曖昧表現`（曖昧を含むもののみ） / `確定`。**絞り込んでもグループ見出しは残す**（構成が崩れて見えないため）。0件になったグループは「該当なし」を出すか見出しのみ残す。
8. **グループ開閉** — キャレットまたは折りたたみプレースホルダのクリックでトグル。開閉状態はユーザー単位で永続化する（章を移動して戻っても保持）。
9. **グループ軸切替** — `グループ：要件区分 ▾`。要件区分 / ステータス / 優先度 / なし。**手動並び順は「要件区分」時のデータ順が唯一の正**とし、他の軸は表示上の並びのみ（実データの順序を書き換えない）。
10. **並び替え** — グループ内カードは `⠿` でドラッグ。グループ見出しごとの並び替えも可。**グループ間へドラッグすると要件区分の変更も同時に成立**する（分類と並び替えを1操作に統合）。ドロップ位置はインジケータライン（2px、`#1b1a17`）で明示。ドラッグが困難なユーザー向けにキーボード操作（`↑↓` で移動、`Space` でつかむ／離す）と `⋯` メニューの「上へ／下へ移動」も用意すること。並び順は自動保存し、この順で提案書に出力される。
11. **曖昧表現** — 本文のマーク箇所クリックで言い換え候補パネル。「許容して進める」を選ぶと `リスク許容で確定` 相当の扱い（理由を残す）。
12. **AI素案** — `AI素案を生成` は章全体の未入力項目に素案を投入。素案由来の値は破線バッジ「AI素案」で示し、人が編集・確定するまで確定不可（もしくは確定時に確認ダイアログ）。
13. **出典** — 「出典 N」クリックで参照元（議事録・ヒアリングシート等）のポップオーバー。
14. **レスポンシブ** — 項目サマリは `auto-fit / minmax(180px,1fr)` で1〜3列に自動変化。ヘッダーのボタン群・バッジ行・一括操作バーはすべて `flex-wrap:wrap`。1024px 未満で左ナビをドロワー化してよい。
15. **hover** — 上記各ボタンの hover 色を適用。トランジションは `background-color / border-color 120ms ease` 程度。
16. **ローディング / エラー** — AI素案生成中はボタンをスピナー付き無効状態にし、対象カードにスケルトン（`#e8e3d8` のプレースホルダ）を出す。失敗時はカード内にインラインエラー（文字 `#8f3a22`、背景 `#fbeae5`）＋再試行。確定APIの失敗時は楽観更新をロールバックしトーストで通知。

## State Management

サーバ側データ（章単位で取得）:
- `chapter`: `{ id, index, title, groups: Group[] }`
- `Group`: `{ id, name, order }`
- `Item`: `{ id, groupId, order, body, solution, kpi, meritDemerit, status: 'draft'|'review'|'confirmed'|'rejected', riskAccepted: boolean, source: 'human'|'ai', citations: Citation[], ambiguities: Ambiguity[], updatedAt, updatedBy }`
- `Ambiguity`: `{ id, span: [start,end], phrase, reason, suggestions: string[] }`

UI状態（クライアント）:
- `selectedIds: Set<string>` — 一括操作の対象
- `filter: 'all'|'todo'|'amb'|'done'`
- `groupBy: '要件区分'|'ステータス'|'優先度'|'なし'`
- `collapsedGroupIds: Set<string>`（永続化）
- `dragging: { itemId, overGroupId, overIndex } | null`
- `pending: Set<string>` — 確定/更新中の項目（楽観更新の追跡）

派生値（計算で出す。二重管理しない）:
- 章の確定数・未確定数、グループ別の確定数/総数、要対応件数、曖昧表現件数、項目ごとの入力充足「n/4」

主な遷移:
- `toggleSelect(id)` / `selectGroup(gid)` / `selectAllVisible()` / `clearSelection()`
- `confirm(ids, { riskAccepted })` → `status: 'confirmed'`（楽観更新 → 失敗でロールバック）
- `reject(ids)` → `status: 'rejected'`
- `reorder(itemId, toGroupId, toIndex)` → `order` と `groupId` を同時更新（1リクエスト）
- `setFilter` / `setGroupBy` / `toggleGroup`
- `generateAiDrafts(chapterId)` → 対象項目に `source:'ai'` の値を投入

データ取得: 章表示時に章の全項目を1回で取得（全15章のうち1章分）。左ナビの各章の状態ドットとグループ進捗は案件サマリAPIで別途取得。確定操作はPATCH（複数IDを1リクエストで）。

## Design Tokens

### Colors
| 用途 | 値 |
|---|---|
| ページ地 | `#f2efe7` |
| カード/ヘッダー地 | `#faf8f3` |
| 純白（ボタン・チップ地） | `#ffffff` |
| 確定済カード地 | `#f7f5ee` |
| 折りたたみ地 | `#f7f4ec` |
| 主要テキスト | `#1b1a17` |
| 副テキスト | `#3c382f` |
| 確定済本文 | `#4a463c` |
| 補助テキスト（最小限のコントラスト確保済） | `#6f6a5e` |
| メタ（Mono） | `#7a7466` |
| 罫線 | `#e3ded2` / 内部区切り `#ece7dc` |
| 破線・弱枠 | `#cdc6b6` / ボタン枠 `#d8d2c4` |
| チェックボックス枠 | `#b3ac9c` |
| primary（緑） | `#2f5d45` / hover `#254a37` / 淡 `#eaf1ec` / 枠 `#cfd9d2` / hover地 `#f0f5f1` |
| 明緑（暗背景上のprimary） | `#8fbf9f` / hover `#a6cfb4` |
| 注意（琥珀・要レビュー） | 文字 `#8a5a18` / 地 `#fbf1de` / 枠 `#ebd7b0` / ドット `#d9a341` `#e2a851` |
| 警告（赤茶・曖昧表現） | 文字 `#8f3a22` / 地 `#fbeae5` / 枠 `#efcbc0` / 下線 `#cf7f66` |
| ダーク面（ナビ・一括バー） | `#1b1a17` / hover `#33302a` / 現在章 `#2b2924` |
| ダーク面上テキスト | `#ffffff` / `#efeae0` / `#f6f3ec` / `#d5cfc1` / `#c9c3b5` / `#b8b1a1` / `#a8a294` / `#8d8778` |
| ダーク面上の未着手ドット | `#5d584c` |
| バートラック | `#e8e3d8` |

> アクセシビリティ: 本文以外の小さな注記でも地色に対して 4.5:1 以上を確保している（`#6f6a5e` ≈ 5.4:1 / `#7a7466` ≈ 4.8:1）。より薄い灰を使わないこと。

### Typography
- 表示・見出し: **Shippori Mincho** 600（章名 27px/1.25、グループ名 15px/1.3、案件名 17px/1.35）
- UI・本文: **Zen Kaku Gothic New** 400 / 500 / 700
  - 項目本文 500 / 15.5px / 1.75（1行形は 14.5px / 1.6）
  - フィールド値 400 / 13.5px / 1.7
  - ボタン 500 / 12〜13px / 1
  - バッジ・チップ 500 / 11〜12px / 1
  - 注記 400 / 11.5〜12px
- 数値・コード的表記: **IBM Plex Mono** 400 / 500（11px、進捗 14px、ラベルは letter-spacing `.1em`〜`.14em` 大文字）
- 本文は `text-wrap: pretty`

### Spacing
`4 / 6 / 8 / 9 / 10 / 11 / 13 / 14 / 16 / 18 / 22 / 26 / 28 / 40` px（8px基調＋微調整）
- メイン padding: `22px 28px 40px`、ヘッダー `22px 28px 0`
- カード padding: 展開形 `16px 18px` / 1行形 `14px 18px`
- グループ間 `26px`、カード間 `10px`

### Radius
`4px`（チェックボックス）/ `7px`（小ボタン・ピル）/ `8px`（ボタン）/ `9px`（primary・ピル容器）/ `10px`（追加行・折りたたみ）/ `12px`（カード）/ `20px`（バッジ・チップ）/ `3px`（進捗バー）/ `50%`（ドット）

### Shadow
- カード: `0 1px 2px rgba(27,26,23,.05)`
- primaryボタン: `0 1px 2px rgba(27,26,23,.14)`
- 一括操作バー: `0 2px 8px rgba(27,26,23,.18)`

### Motion
- `rise`: `opacity 0→1` ＋ `translateY(6px)→0` / 180ms ease（一括操作バーの出現）
- hover: 120ms ease（背景・枠色）

## Assets

- 画像・アイコンフォントは未使用。記号はテキストグリフのみ: `⠿`（ドラッグハンドル）`▾ ▸`（開閉）`✓`（チェック・確定）`–`（一部選択）`⋯`（メニュー）`←  →`（章移動）`＋`（追加）
  - 実装では既存コードベースのアイコンセット（drag-handle / chevron / check / ellipsis / arrow / plus）に置き換えることを推奨。特に `⠿` と `⋯` はフォント依存があるためSVGアイコン化する。
- フォントは Google Fonts: Shippori Mincho / Zen Kaku Gothic New / IBM Plex Mono。既存プロダクトの和文フォントがあればそちらを優先し、見出しに明朝、数値にモノスペースという役割分担だけ踏襲すること。
- `reference_現状画面.png` — 改修前の状態（実装対象ではない）

## Files

- `要件画面 3a 高精度デザイン.dc.html` — 実装対象の高精度デザイン。上部テンプレートがマークアップ、下部 `class Component extends DCLogic` が状態ロジック（選択・確定・フィルタ・グループ開閉の挙動はここを読むと分かる）
- `要件画面UXワイヤーフレーム.dc.html` — 検討案一覧（採用案 3a、他は背景）
- `reference_現状画面.png` — 改修前スクリーンショット
- `support.js` — 上記HTMLをブラウザで開くためのプレビュー用ランタイム（実装不要）
