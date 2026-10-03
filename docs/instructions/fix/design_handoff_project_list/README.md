# Handoff: 「案件一覧」画面のUX改善 — 案 8a（カード／一覧 切替）

## Overview
ReqNavi のトップ画面「案件一覧」の改修。現状（`reference_現状案件一覧.png`）の問題:
- 顧客の絞り込みが「絞り込む」ボタン押下式（即時反映されない）。検索・状態・並べ替えがない
- 進捗バーが低進捗で**赤**（不具合に見える）。「15章／確定 13/78件」では何がどこまで進んだか不明
- 次に何をすればよいかの導線がない。カード全体が押せるか不明
- 案件が少ないと余白だらけ。カード／一覧の切替がテキストリンクで弱い

改修方針（採用案 **8a**）:
1. 検索・顧客・並べ替え・状態チップを**入力と同時に反映**（「絞り込む」ボタン廃止）
2. **表示形式は カード／一覧 の切替**。選択は永続化（次回も維持）
3. 進捗は **15章セグメント**（確定=緑／作成中=琥珀／未着手=灰）。**赤は使わない**
4. カードに「**〈章〉から続ける →**」（未着手は「から始める」）で作業に直行
5. カード全体／表の行全体がクリックで案件を開く

## About the Design Files
HTML は**デザインリファレンス（プロトタイプ）**。既存コードベース（React/Vue/Rails等）のパターンで作り直すこと。インラインスタイル・`support.js` は再現不要。値と挙動のみ使う。
- `案件一覧 8a 高精度デザイン.dc.html` — 実装対象（操作可）
- `要件画面UXワイヤーフレーム.dc.html` — 検討過程（ターン8＝本画面。8b表／8cグルーピングは不採用だが、8cは並べ替え「顧客別」に取り込み済み）
- `reference_現状案件一覧.png` — 改修前

## Fidelity
High-fidelity。既存デザインシステムがあればそちらを優先（緑=primary、琥珀=作成中）。

## Screen: 案件一覧

**Layout**: 背景 `#f2efe7`。上部ナビ（高さ52px、背景 `#faf8f3`、下境界 `1px solid #e3ded2`、ReqNavi ロゴ＋顧客管理／ユーザ管理）。本文は `max-width:1120px; margin:0 auto; padding:32px 28px 56px; gap:20px`。

**ページヘッダー**: 「PROJECTS」Mono 500/11px/letter-spacing `.14em`/`#6f6a5e` ＋ `<h1>`「案件一覧」Shippori Mincho 600/26px。右端 `＋ 新規案件`（primary：`#2f5d45`／文字 `#fff`／`radius 9px`／padding `12px 18px`／500/13px／hover `#254a37`）。

**ツールバー**（`gap:10px; flex-wrap:wrap`）
- 検索入力：幅 220〜340px、`radius 9px`、枠 `1px solid #d8d2c4`、padding `12px 14px`、13px、placeholder「案件名・顧客名で検索」
- 顧客セレクト：「顧客：すべて」＋顧客一覧
- 並べ替え：更新が新しい順／進捗が高い順／案件名順／顧客別にまとめる
- 右端 **表示切替**（セグメント、`radius 9px`、枠 `#d8d2c4`）：「▦ カード」「☰ 一覧」。選択中は背景 `#1b1a17`／文字 `#f6f3ec`。`role="group"` ＋ `aria-label="表示形式"`
- フォーカスリング：`2px solid #2f5d45`（offset 1px）。省略しないこと

**状態チップ行**：すべて／進行中／未着手／完了（`radius 20px`、padding `8px 14px`、12px、件数はMono）。選択中は背景 `#1b1a17`。右端に「N 件を表示」（400/11.5px/`#6f6a5e`）。件数は**検索・顧客の絞り込み後**の値。

**カード表示**（`grid-template-columns: repeat(auto-fill,minmax(300px,1fr)); gap:16px`）
- カード：背景 `#faf8f3`、枠 `1px solid #e3ded2`、`radius 14px`、padding `20px 22px`、`gap:14px`、影 `0 1px 2px rgba(27,26,23,.05)`、hover 枠 `#b3ac9c`／背景 `#fff`、`cursor:pointer`
- 1行目：顧客名（400/12px/`#6f6a5e`、1行省略）＋ 右端プラットフォームタグ（`Salesforce`：500/10.5px/`#6f6a5e`／背景 `#fff`／枠 `1px solid #e3ded2`／`radius 20px`）
- 案件名：Shippori Mincho 600/18px/1.45
- 進捗：**15個のセグメント**（各 `flex:1; height:7px; radius 2px; gap 2px`）。確定章 `#2f5d45`／作成中 `#d9a341`／未着手 `#e3ded2`。下に `17%`（Mono 500/15px、0%は `#6f6a5e`、それ以外 `#2f5d45`）＋「確定 13 / 78 項目」（400/12px/`#6f6a5e`）＋ 右端「2/15章」（Mono 400/11px/`#7a7466`）
- フッター（上境界 `1px solid #ece7dc`、padding-top `13px`）：更新情報「3分前・田中」（400/11px/`#6f6a5e`）＋ 右端 CTA
  - 進行中：`〈章名〉から続ける →`（背景 `#2f5d45`／文字 `#fff`／`radius 8px`／padding `10px 13px`／500/12px）
  - 未着手：`〈章名〉から始める →`（白地／文字 `#2f5d45`／枠 `#cfd9d2`）

**一覧（表）表示**（外枠 `radius 14px`、枠 `1px solid #e3ded2`、背景 `#faf8f3`）
- 列：`minmax(0,1.7fr) minmax(0,1.3fr) 168px 112px 104px 44px` ＝ 案件（＋プラットフォームタグ）／顧客／15章の進捗（セグメント高さ8px）／確定項目（`13/78 17%`）／最終更新／`⋯`
- ヘッダー行：背景 `#f4f1e9`、Mono 500/10.5px/`#6f6a5e`。行高：padding `16px 20px`、行罫 `#ece7dc`、hover 背景 `#fff`、行クリックで案件を開く
- `⋯` メニュー：複製／アーカイブ／削除（クリックは行遷移を発火させない）

**空状態**：「条件に合う案件がありません。」＋`条件をクリア`ボタン（破線枠 `1px dashed #cdc6b6` のパネル）

**凡例**（下部）：章の進捗：確定＝緑／作成中＝琥珀／未着手＝灰

## Interactions & Behavior
1. 検索（案件名＋顧客名の部分一致、大文字小文字無視）・顧客・状態は**即時フィルタ**。デバウンス不要（件数が少ない前提。大量になればサーバ側に）
2. 状態の判定：`完了`＝確定率100%／`進行中`＝確定>0／`未着手`＝確定0
3. 並べ替え：更新順（降順）／進捗順（確定率降順）／案件名順／顧客別（顧客名→案件名）
4. **表示形式は localStorage（またはユーザ設定API）に保存**し、次回も復元。既定はカード
5. 「続ける」の章：**最後に編集した章**、なければ最初の未確定章。未着手は第1章
6. カード／行のクリックで案件詳細（章ページ）へ。`⋯`・CTAボタンのクリックは伝播を止め、CTAは該当章へ直接遷移
7. 章セグメントの状態：その章の全項目が確定＝確定／1項目以上確定or入力あり＝作成中／それ以外＝未着手
8. レスポンシブ：カードは auto-fill で折り返し。表は 900px 未満で「確定項目」「最終更新」列を非表示にしてよい

## State Management
データ：`Project { id, name, customerId, customerName, platform, updatedAt, updatedBy, chapters: [{ index, title, state:'confirmed'|'drafting'|'empty', confirmed, total }], lastEditedChapter }`
UI状態：`view('card'|'table', 永続)`、`query`、`customerId|'all'`、`status`、`sort`
派生：確定項目数／総数、確定率、状態、章セグメント、状態チップ件数、「続ける」章

## Design Tokens
共通（3a/4b/5c/6c/7a と同一）
- 色：ページ `#f2efe7`／カード・ヘッダー `#faf8f3`／白 `#fff`／文字 `#1b1a17`・`#3c382f`・補助 `#6f6a5e`・メタ `#7a7466`／罫線 `#e3ded2`・`#ece7dc`／枠 `#d8d2c4`／primary `#2f5d45`（hover `#254a37`、淡枠 `#cfd9d2`）／作成中 `#d9a341`／未着手セグメント `#e3ded2`
- フォント：見出し **Shippori Mincho** 600（h1 26px／カード名 18px）、UI **Zen Kaku Gothic New** 400/500/700、数値・ラベル **IBM Plex Mono** 400/500
- Radius：カード `14px`／入力・セレクト・セグメント `9px`／ボタン `8px`／チップ・タグ `20px`／セグメント `2px`
- Shadow：カード `0 1px 2px rgba(27,26,23,.05)`、primaryボタン `0 1px 2px rgba(27,26,23,.14)`

## Assets
画像なし。記号は `▦ ☰ ⋯ ＋ →`（既存アイコンセットに置換推奨）。顧客名・案件名・数値はサンプル。プラットフォームは**案件名の脇に小さく表示するのみ**（絞り込み項目にはしていない。必要なら顧客セレクトと並べて追加）。

## Files
- `案件一覧 8a 高精度デザイン.dc.html`（`class Component` に絞り込み・並べ替え・状態判定・表示形式の永続化）
- `要件画面UXワイヤーフレーム.dc.html`、`reference_現状案件一覧.png`、`support.js`（実装不要）
