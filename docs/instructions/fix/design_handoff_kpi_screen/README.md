# Handoff: 「4. KPI」画面（ゴール→目標→戦略→戦術の階層編集）のUX改善 — 案 4b

## Overview

ReqNavi（案件の要件定義を15章立てで作成・レビューするWebアプリ）の **4. KPI 章ページ** の改修デザイン。

この章は他章と構成が異なり、**ゴール → 目標 → 戦略 → 戦術** の4階層ツリーを編集する。現状（`reference_現状KPI画面.png`）の問題:

- 階層が深いほどテキストボックスが右に押され、**戦術の入力欄が最も細い**（一番長文を書く階層なのに）
- 全ノードが常時テキストボックス。閲覧時も編集時も同じ見た目で、どこが未確定かわからない
- 各行の右に `+ 目標を追加` `+ 戦略を追加` `+ 戦術を追加` `削除` が素のリンクで並び、押し間違えやすい
- 折りたたみがなく、目標が増えるほど縦に長い
- 確定・レビュー状態の概念がない（他章にはある）
- AI素案がゴール単位でしか作れず、戦略・戦術を1件ずつ考える負担が大きい

改修方針（採用案 = **4b：アウトライナー＋詳細ペイン**）:

1. **左＝構造ペイン（ツリー）／右＝編集ペイン** の2ペイン。**編集欄の幅は階層の深さに関係なく一定**（現状最大の不満点の解消）
2. ツリーは折りたたみ可、状態ドットで確定／要レビュー／下書きを表示
3. **AI候補は「選択中ノードの1つ下の階層」を提案する**（目標→戦略候補／戦略→戦術候補／戦術→測定指標候補）。候補ごとに「根拠」を添え、採用／見送り／すべて採用
4. 採用した候補は **`AI` 印つきの下書き** としてツリーに追加され、人が確定するまで素案扱い
5. 「確定して次へ」でステータス更新＋次ノードへ自動移動（流し作業に最適化）
6. 削除・階層変更は `⋯` メニューに集約
7. 左端の章ナビ・配色・タイポは **5. システム要件の改修案（3a）と共通**。同一プロダクトとして揃える

## About the Design Files

このバンドルのHTMLは **HTMLで作成したデザインリファレンス（プロトタイプ）** であり、そのまま本番投入するコードではない。意図した見た目と挙動を示すものなので、**対象コードベースの既存環境（React / Vue / Rails など）と既存のパターン・ライブラリで作り直す** ことがタスク。環境が未整備なら適切なフレームワークを選定して実装してよい。

HTML内のインラインスタイルや独自ランタイム（`support.js`）はプレビュー用の仕組みで、実装で真似する必要はない。値（色・サイズ・余白・コピー）と挙動だけを取り出すこと。

ファイル:
- `KPI画面 4b 高精度デザイン.dc.html` — **実装対象**（高精度）。ブラウザで直接開けて操作できる
- `要件画面UXワイヤーフレーム.dc.html` — 検討過程の低精度ワイヤー。**ターン4（4a / 4b / 4c）がこのKPI画面の検討**で、4b が採用案。ターン1〜3は5. システム要件側の検討
- `参考_要件画面 3a 高精度デザイン.dc.html` — 同システムの別画面（5. システム要件）の改修案。**共通のデザイントークン・章ナビ・ステータス表現の参照元**
- `reference_現状KPI画面.png` — 改修前スクリーンショット
- `support.js` — プレビュー用ランタイム（実装不要）

## Fidelity

**High-fidelity（hifi）**。`KPI画面 4b 高精度デザイン.dc.html` は最終の配色・タイポグラフィ・余白・状態遷移を持つ。ただし **既存プロダクトのデザインシステムが優先**：トークンが既にあればマップする（緑=primary、琥珀=warning/要レビュー、破線=AI由来）。

ワイヤー（4a / 4c）は lofi。採用しない案だが「なぜ2ペインにしたか」の背景として参照可。

## Screens / Views

### 画面: 4. KPI 章ページ

**Purpose**
- 作成者: ゴールから目標・戦略・戦術を段階的に具体化する。AI候補を採用して素案を素早く埋め、文言を整える
- 確認者: ツリーで全体構造と未確定箇所を把握し、1件ずつ確定していく

**Layout**（ルート）
- `display:grid; grid-template-columns: minmax(176px,212px) minmax(232px,296px) minmax(0,1fr); min-height:100vh`
- 背景 `#f2efe7`
- 第1列: 章ナビ（`position:sticky; top:0; height:100vh; overflow:auto`、`#1b1a17`）
- 第2列: 構造ペイン（同じく sticky・全高スクロール、`#faf8f3`、右境界 `1px solid #e3ded2`）
- 第3列: 編集ペイン（`background:#fff`、`min-width:0`、下部にsticky なアクションバー）
- 1024px 未満では構造ペインをドロワー/タブに切り替えてよい（編集ペインを優先表示）

---

#### A. 章ナビ（第1列・幅176–212px）

3a（5. システム要件）と同一仕様。現在章が「4. KPI」で、配下に **目標 / 戦略 / 戦術の件数** を表示する（3aではグループ名と確定数）。
- 背景 `#1b1a17`、文字 `#efeae0`
- 案件名: Shippori Mincho 600 / 16px / 1.35 / `#fff`
- 「← 案件一覧」: IBM Plex Mono 500 / 11px / letter-spacing `.1em` / `#a8a294`
- 全体進捗バー: 高さ4px、トラック `rgba(239,234,224,.18)`、フィル `#8fbf9f`、値 `11%`（Mono 11px / `#c9c3b5`）
- セクションラベル「要件定義」: Mono 500 / 10.5px / letter-spacing `.14em` / `#8d8778`
- 章行: padding `7px 10px`、`gap:9px`、章名 400 / 12.5px / `#c9c3b5`、状態ドット6px（確定 `#8fbf9f` / 進行中 `#e2a851` / 未着手 `#5d584c`）
- 現在章: 背景 `#2b2924`、`radius 8px`、章名 700 / 12.5px / `#fff`。配下に `padding-left:15px` で「目標 3 / 戦略 3 / 戦術 5」（ラベル 400/11.5px/`#d5cfc1`、数値 Mono 400/10.5px/`#8d8778`、`margin-left:auto`）
- 「7〜15章を表示 ▾」400 / 11.5px / `#8d8778`
- フッター: 「確定判定ダッシュボード」背景 `#efeae0` / 文字 `#1b1a17` / 500 / 12px / `radius 7px` / padding `10px 12px`

---

#### B. 構造ペイン（第2列）

**ヘッダー**（padding `18px 16px 14px`、下境界 `1px solid #e3ded2`、`gap:10px`）
- 「CHAPTER 04 / 15」Mono 500 / 11px / letter-spacing `.14em` / `#6f6a5e`
- 未確定ピル「未確定 N」: 文字 `#8a5a18` / 背景 `#fbf1de` / 枠 `1px solid #ebd7b0` / `radius 20px` / padding `4px 10px` / 500 / 11px
- 章名 `<h1>`「KPI」Shippori Mincho 600 / 23px / 1.25
- ボタン2つ（`gap:8px; flex-wrap:wrap`）
  - `すべて畳む` ⇄ `すべて展開`（トグル・ラベルが状態で変わる）: 白ボタン（500/11.5px、`#3c382f`、枠 `1px solid #d8d2c4`、`radius 7px`、padding `8px 11px`、hover 背景 `#f4f1e9`）
  - `AI素案を一括生成`: primary（背景 `#2f5d45`、文字 `#fff`、hover `#254a37`）

**ツリー行**（padding `8px 6px 12px`、行間 `gap:1px`）

各行 = 1ノード。`display:flex; align-items:center; gap:7px; border-radius:7px; cursor:pointer`
- padding: `8px 9px 8px {8 + depth*15}px` — **深さ1段 = 15px のインデント**
- 選択中: 背景 `#fff` ＋ 左端 `3px solid #1b1a17`。非選択: 背景 `transparent` ＋ 左端 `3px solid transparent`（幅が動かないよう常に枠を確保）
- hover: 背景 `#f1ede2`
- 構成要素（左から）
  1. 開閉キャレット `▾ / ▸`（子がない行は空文字で幅10px確保）: Mono 400 / 10px / `#6f6a5e`。**キャレットのクリックは折りたたみのみ**（行選択と分離）
  2. 種別ラベル: Mono 500 / 9.5px / letter-spacing `.06em` / `#7a7466` — `G` / `目標1` `目標2` `目標3` / `戦略` / `戦術`
  3. 本文: 1行省略（`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`）、`12.5px/1.45`。**ゴールと目標は 700、選択中は 500、それ以外は 400**
  4. `AI` 印（AI由来ノードのみ）: Mono 500 / 9px / `#6f6a5e` / 枠 `1px dashed #cdc6b6` / `radius 20px` / padding `3px 6px`
  5. 状態ドット 7px 円: 確定 `#2f5d45` / 要レビュー `#d9a341` / 下書き `#cdc6b6`
- 末尾に `＋ 目標を追加`: 破線ボタン（枠 `1px dashed #cdc6b6`、`radius 8px`、padding `10px`、左padding `14px`、400/12px/`#6f6a5e`、hover: 背景 `#fff` / 文字 `#2f5d45` / 枠 `#a9c3b4`）

**フッター（キーボードヒント）** — 上境界 `1px solid #e3ded2`、padding `11px 14px 14px`
- 「Tab / Shift+Tab で階層変更」「↑↓ で移動・⌥↑↓ で並べ替え」400 / 11px / 1.5 / `#6f6a5e`

---

#### C. 編集ペイン（第3列・背景 #fff・padding 20px 26px 0・gap 16px）

1. **パンくず行**（`gap:9px; flex-wrap:wrap`）
   - パンくず「ゴール › 目標1 › 戦略 ›」400 / 11.5px / `#6f6a5e`
   - 現在の種別ピル: 文字 `#1b1a17` / 枠 `1px solid #1b1a17` / `radius 20px` / padding `5px 11px` / 500 / 11px
   - ステータスピル: 確定済（`#2f5d45` / `#eaf1ec` / 枠 `#cfd9d2`）／要レビュー（`#8a5a18` / `#fbf1de` / 枠 `#ebd7b0`）／下書き（`#6f6a5e` / `#fff` / 枠 `#e3ded2`）
   - AI由来なら「AI素案から採用」ピル（破線 `1px dashed #cdc6b6` / `#6f6a5e`）
   - 右端「1 / 12 件目」Mono 400 / 11px / `#7a7466`（表示中ツリーの通し位置）

2. **本文フィールド**
   - ラベル「〈種別〉の内容」Mono 500 / 10.5px / letter-spacing `.1em` / `#6f6a5e`
   - 入力: 枠 `1px solid #d8d2c4`、`radius 10px`、padding `14px 16px`、背景 `#faf8f3`、**500 / 15.5px / 1.75**、`text-wrap:pretty`、hover 枠 `#b3ac9c`。クリックでインライン編集（textarea 化 or contenteditable）。**幅は階層に依存しない**
   - 補助「階層が深くても入力幅は一定。クリックでそのまま編集できます。」400 / 11px / `#6f6a5e`

3. **付随フィールド**（`display:grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap:14px`）
   - 「測定指標」: 枠 `1px solid #d8d2c4` / `radius 9px` / padding `11px 13px` / 400 / 13.5px / 1.7 / `#3c382f` / 背景 `#faf8f3`。未入力時は「未入力 ＋」
   - 「担当・期限」: 枠 `1px dashed #cdc6b6` / `radius 9px` / 400 / 12.5px / `#6f6a5e` / 「＋ 未設定」、hover 枠 `#a9c3b4` 文字 `#2f5d45`
   - ラベルはいずれも Mono 500 / 10.5px / letter-spacing `.1em` / `#6f6a5e`

4. **AI候補パネル** — 枠 `1px solid #cfd9d2`、`radius 12px`、背景 `#f7faf8`、`overflow:hidden`
   - ヘッダー: padding `13px 16px`、下境界 `1px solid #e0e8e3`
     - 「AI候補」Shippori Mincho 600 / 13.5px
     - 説明「選択中の〈種別〉にひもづく〈子種別〉を提案します」400 / 11px / `#6f6a5e`
     - 右端 primary ボタン「〈子種別〉候補を出す」（背景 `#2f5d45` / 文字 `#fff` / `radius 8px` / padding `10px 14px` / 500 / 12px、hover `#254a37`）
   - **生成中**: 高さ44pxのスケルトン2枚（`background:#e8e3d8`、`radius 9px`、`pulse` アニメーション 1.1s ease-in-out infinite で opacity .45↔.85）＋「〈…〉中…（この章の他の目標・システム要件を参照しています）」400/11.5px/`#6f6a5e`
   - **候補カード**（`gap:10px`、`rise` 180ms で出現）
     - 背景 `#fff`、枠 `1px solid #dfe7e2`、`radius 10px`、padding `13px 14px`、`display:flex; gap:12px`
     - 左: 種別チップ（Mono 500/10px、破線 `1px dashed #cdc6b6`、`radius 20px`、padding `4px 7px`）
     - 中央: 候補本文 500 / 14px / 1.65 ＋ 「根拠：…」400 / 11.5px / 1.6 / `#6f6a5e`
     - 右: `採用`（primary 小・padding `9px 13px`）と `見送り`（白・文字 `#6f6a5e`・枠 `#d8d2c4`、hover 背景 `#f4f1e9`）を縦積み
   - 候補リスト下: `すべて採用`（文字 `#2f5d45` / 枠 `1px solid #cfd9d2` / hover 背景 `#f0f5f1`）、`別の案を出す`（白ボタン）、右端に注記「採用した候補は「AI素案」印つきで下位に追加され、確定するまで素案扱いです」400/11px/`#6f6a5e`
   - **空状態**: 「「〈子種別〉候補を出す」を押すと、この〈種別〉と他章（5. システム要件など）の内容を参照した候補が3件表示されます。」400/12.5px/1.6/`#6f6a5e`

5. **下位項目リスト**
   - ラベル「この〈種別〉の下位」Mono 500 / 10.5px / letter-spacing `.1em` / `#6f6a5e`
   - 各行: 枠 `1px solid #e3ded2` ＋ **左端 3px が子の状態カラー**、`radius 9px`、padding `11px 13px`、背景 `#faf8f3`、hover `#f4f1e9`、`cursor:pointer`
     - 種別ラベル（Mono 500/9.5px/`#7a7466`）＋ 本文（400/13px/1.6/`#3c382f`、折り返し可）＋ `AI` 印 ＋ 右端 `→`（Mono 11px/`#7a7466`）
     - クリックでその子を選択（ツリー選択と同期）
   - 末尾 `＋ 〈子種別〉を手入力で追加`: 破線ボタン（padding `12px`、左padding `15px`）

6. **アクションバー（sticky bottom）**
   - `position:sticky; bottom:0`、上境界 `1px solid #e3ded2`、背景 `#faf8f3`、padding `13px 26px`、`gap:10px; flex-wrap:wrap`
   - 未確定時: `確定して次へ` — primary（padding `11px 18px`、`box-shadow 0 1px 2px rgba(27,26,23,.14)`）
   - 確定済: 「✓ 確定済」状態表示（文字 `#2f5d45` / 背景 `#eaf1ec` / 枠 `1px solid #cfd9d2` / padding `11px 16px`）
   - `〈子種別〉を追加` — 白ボタン
   - `⋯` — 白ボタン（Mono 500/13px）。中身: **削除 / 1段上げる（Shift+Tab）/ 1段下げる（Tab）/ 上へ移動 / 下へ移動 / 複製**
   - 右端注記「削除・階層変更は ⋯ の中」400/11px/`#6f6a5e`

## Interactions & Behavior

1. **ノード選択** — ツリー行、または編集ペインの下位項目リストをクリック。右ペインが即座に切り替わる。パンくず・種別・ステータス・「N / M 件目」も更新
2. **折りたたみ** — キャレットのクリックのみで開閉（行選択とは分離）。`すべて畳む`は目標・戦略を一括で閉じ、いずれかが閉じている状態ではラベルが `すべて展開` に変わる。開閉状態はユーザー単位で永続化
3. **AI候補生成** — `〈子種別〉候補を出す`／`AI素案を一括生成`で、**選択ノードの1つ下の階層**の候補を3件（戦術選択時は測定指標2件）生成
   - ゴール → 目標候補 / 目標 → 戦略候補 / 戦略 → 戦術候補 / 戦術 → 測定指標候補
   - 生成中はスケルトン表示（プロトタイプでは700msのダミー。実装はストリーミングまたはポーリング）
   - プロンプトには **選択ノードの本文＋祖先の文脈＋同章の他ノード＋他章（5. システム要件等）の確定済内容** を渡す。候補には必ず **「根拠」1文** を返させる（UIが根拠を前提にしている）
   - `別の案を出す` は同一ノードで再生成（前回候補を置き換え、既出と重複しないよう round を渡す）
4. **採用** — 候補の `採用` で、選択ノードの**末尾の子**として `status:'draft'`, `source:'ai'` のノードを追加し、**追加したノードを選択状態にする**。採用済み候補はリストから消える。`すべて採用` は残り全件を順に追加
   - 戦術選択中（子階層なし）の採用は、**そのノードの測定指標フィールドに書き込む**（ノード追加ではない）
5. **見送り** — 候補をリストから除去（サーバ側にも「却下」を記録し、再生成時に同案を出さない）
6. **確定して次へ** — 選択ノードを `confirmed` にし、**表示中ツリーの次のノード**へ自動移動。ツリーのドット・「未確定 N」・左ナビ件数が即時更新
7. **手動追加** — `＋ 目標を追加`（ツリー末尾）／`〈子種別〉を追加`（選択ノードの子）。追加後はプレースホルダ本文で選択状態にし、本文入力にフォーカスを当てる
8. **階層変更・並べ替え** — ツリー行のドラッグ、`Tab`/`Shift+Tab`（1段下げ／上げ）、`⌥↑↓`（同階層内の並べ替え）、`⋯` メニューからも同操作。**並び順は成果物の掲載順**として保存する
9. **インライン編集** — 本文・測定指標はクリックで編集開始、blur または `⌘Enter` で保存（オートセーブ）。`Esc` で取り消し
10. **キーボード** — `↑↓` でツリー移動、`Enter` で編集開始、`⌘Enter` で確定して次へ。フォーカスリングは省略せず表示すること
11. **レスポンシブ** — 付随フィールドは `auto-fit / minmax(190px,1fr)` で1〜2列。候補カード・アクションバーは `flex-wrap:wrap`。1024px 未満は構造ペインをドロワー化
12. **ローディング / エラー** — 生成中はボタンを無効化＋スケルトン。失敗時は候補パネル内にインラインエラー（文字 `#8f3a22` / 背景 `#fbeae5` / 枠 `#efcbc0`）＋`再試行`。確定・保存の失敗は楽観更新をロールバックしトーストで通知
13. **hover / transition** — 各ボタンの hover 色を適用、`background-color / border-color 120ms ease`

## State Management

サーバ側データ:
- `Node`: `{ id, chapterId, parentId, kind: 'goal'|'objective'|'strategy'|'tactic', order, text, metric, owner, dueDate, status: 'draft'|'review'|'confirmed', source: 'human'|'ai', createdFromCandidateId, updatedAt, updatedBy }`
  - ゴールは章に1件（`parentId: null`）。深さは kind から決まる（goal 0 / objective 1 / strategy 2 / tactic 3）
- `Candidate`: `{ id, nodeId(親), kind, text, why, round, state: 'open'|'adopted'|'rejected' }`

UI状態:
- `selectedId: string`
- `collapsedIds: Set<string>`（永続化）
- `candidates: Record<parentNodeId, Candidate[]>`（open のみ表示）
- `loadingFor: string | null`（生成中のノードID）
- `round: number`（再生成の回数。プロンプトに渡して重複回避）
- `editing: { nodeId, field } | null`

派生値（計算で出す）:
- 表示中ツリー（collapsed を反映した平坦リスト）、深さ、`N / M 件目`
- 目標/戦略/戦術の件数、未確定件数、パンくず、下位項目リスト

主な操作:
- `select(id)` / `toggleCollapse(id)` / `collapseAll()`
- `generate(nodeId)` → `Candidate[]`（子階層 or 測定指標）
- `adopt(nodeId, candidateId)` → 子ノード作成（`source:'ai'`, `status:'draft'`）または `metric` 更新。候補を `adopted` に
- `reject(nodeId, candidateId)` → 候補を `rejected` に
- `confirm(nodeId)` → `status:'confirmed'`、次ノードへ移動
- `addChild(nodeId, kind)` / `addObjective()`
- `move(nodeId, newParentId, newOrder)` — 階層変更と並べ替えを1リクエストで
- `updateText(nodeId, field, value)` — オートセーブ（デバウンス 600ms 程度）

データ取得: 章表示時に章の全ノードを1回で取得（ツリー全体で数十件規模）。候補は生成時のみ取得し、`open` のものだけ復元表示する。

## Design Tokens

3a（5. システム要件）と**完全に共通**。既存トークンがあればそちらへマップすること。

### Colors
| 用途 | 値 |
|---|---|
| ページ地 | `#f2efe7` |
| 構造ペイン地 / フィールド地 | `#faf8f3` |
| 編集ペイン地 | `#ffffff` |
| AI候補パネル地 | `#f7faf8`（境界 `#e0e8e3`、外枠 `#cfd9d2`、カード枠 `#dfe7e2`） |
| 主要テキスト | `#1b1a17` |
| 副テキスト | `#3c382f` |
| 補助テキスト | `#6f6a5e`（4.5:1以上を確保） |
| メタ（Mono） | `#7a7466` |
| 罫線 | `#e3ded2` |
| ボタン枠 | `#d8d2c4` / 破線 `#cdc6b6` |
| primary（緑） | `#2f5d45` / hover `#254a37` / 淡地 `#eaf1ec` / 枠 `#cfd9d2` / hover地 `#f0f5f1` |
| 明緑（暗背景上） | `#8fbf9f` |
| 要レビュー（琥珀） | 文字 `#8a5a18` / 地 `#fbf1de` / 枠 `#ebd7b0` / ドット `#d9a341` `#e2a851` |
| 下書き（ドット） | `#cdc6b6` |
| エラー（赤茶） | 文字 `#8f3a22` / 地 `#fbeae5` / 枠 `#efcbc0` |
| ダーク面（章ナビ） | `#1b1a17` / 現在章 `#2b2924` |
| ダーク面上テキスト | `#fff` / `#efeae0` / `#d5cfc1` / `#c9c3b5` / `#a8a294` / `#8d8778` / 未着手ドット `#5d584c` |
| スケルトン | `#e8e3d8` |
| hover（淡） | `#f4f1e9` / ツリー行 `#f1ede2` |

> **AI由来の表現は「破線」で統一**（`1px dashed #cdc6b6`）。色ではなく線種で示すことで、ステータス色（緑・琥珀）と衝突しない。

### Typography
- 見出し: **Shippori Mincho** 600 — 章名 23px/1.25、案件名 16px/1.35、パネル見出し 13.5px
- UI・本文: **Zen Kaku Gothic New**
  - 本文入力 500 / 15.5px / 1.75
  - 候補本文 500 / 14px / 1.65
  - フィールド値 400 / 13.5px / 1.7、下位項目 400 / 13px / 1.6
  - ツリー行 12.5px / 1.45（ゴール・目標 700 / 選択中 500 / 他 400）
  - ボタン 500 / 11.5〜13px
  - 注記 400 / 11〜11.5px
- ラベル・数値: **IBM Plex Mono** 400 / 500 — フィールドラベル 10.5px（letter-spacing `.1em`）、章ラベル 11px（`.14em`）、種別ラベル 9.5px（`.06em`）、`AI` 印 9px
- 長文には `text-wrap: pretty`

### Spacing
`3 / 6 / 7 / 8 / 9 / 10 / 11 / 13 / 14 / 15 / 16 / 18 / 20 / 26` px
- 編集ペイン padding `20px 26px 0`、アクションバー `13px 26px`
- 構造ペインヘッダー `18px 16px 14px`、ツリー行 `8px 9px`
- **ツリーのインデント = 深さ × 15px（基準 8px）**

### Radius
`7px`（ツリー行・小ボタン）/ `8px`（ボタン）/ `9px`（フィールド・下位項目・スケルトン）/ `10px`（本文入力・候補カード）/ `12px`（AI候補パネル）/ `20px`（ピル）/ `3px`（進捗バー）/ `50%`（ドット）

### Shadow
- primaryボタン（アクションバー）: `0 1px 2px rgba(27,26,23,.14)`
- カードには影を使わない（枠線で構造を示す）

### Motion
- `rise`: `opacity 0→1` ＋ `translateY(6px)→0` / 180ms ease（候補カード出現）
- `pulse`: opacity `.45 ↔ .85` / 1.1s ease-in-out infinite（スケルトン）
- hover: 120ms ease

## Assets

- 画像・アイコンフォントは未使用。記号はテキストグリフのみ: `▾ ▸`（開閉）`✓`（確定）`⋯`（メニュー）`→`（子へ）`›`（パンくず）`＋`（追加）`←`（戻る）
  - 実装では既存アイコンセット（chevron / check / ellipsis / arrow / plus）に置き換え推奨
- フォントは Google Fonts: Shippori Mincho / Zen Kaku Gothic New / IBM Plex Mono。既存の和文フォントがあればそちらを優先し、「見出しに明朝・ラベルと数値にモノスペース」という役割分担だけ踏襲すること
- `reference_現状KPI画面.png` — 改修前の状態（実装対象ではない）

## Files

- `KPI画面 4b 高精度デザイン.dc.html` — 実装対象。上部がマークアップ、下部 `class Component extends DCLogic` に状態ロジック（ツリー平坦化・候補生成・採用・確定の挙動はここを読むと分かる。`suggest()` のダミー文言は実装時にAPIへ差し替え）
- `要件画面UXワイヤーフレーム.dc.html` — 検討案（ターン4の 4b が採用案）
- `参考_要件画面 3a 高精度デザイン.dc.html` — 同システム 5. システム要件の改修案（共通トークン・章ナビの参照元）
- `reference_現状KPI画面.png` — 改修前スクリーンショット
- `support.js` — プレビュー用ランタイム（実装不要）
