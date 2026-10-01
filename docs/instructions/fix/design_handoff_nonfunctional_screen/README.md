# Handoff: 「10. 非機能要件」画面（観点カタログ＋チェック項目）のUX改善 — 案 6c

## Overview

ReqNavi（案件の要件定義を15章立てで作成・レビューするWebアプリ）の **10. 非機能要件 章ページ** の改修デザイン。

この章は「性能拡張性・可用性・運用保守性・セキュリティ・移植性…」といった**非機能の観点ごとに、方針（概要）と複数のチェック項目を定義し、各項目を判定する**構成。

現状（`reference_現状非機能要件画面.png`）の問題:

- 観点カードが並ぶが、**空の「概要」テキストエリアが常設**されており、未入力でも縦に大きく場所を取る
- **「可用性」のカードが2枚重複**している（同じ観点の重複追加を弾いていない）
- 「+ 項目を追加」がカードごとに散在するリンク表示で、押しづらく主従が不明
- チェック項目の状態が「未」というグレーのバッジだけで、**何の状態か・どう変えるのかが読めない**
- 「削除」が素のテキストリンクで、誤操作が起きやすい
- 画面下部の「+ 移植性を追加」「+ セキュリティを追加」だけが別扱いのボタンとして置かれ、観点追加の入口が2か所に分かれている
- 章全体の記入状況・判定状況が分からない
- 観点の**抜け漏れ**（未検討の観点があるか）が分からない

改修方針（採用案 = **6c：観点カタログ＋詳細の2ペイン**）:

1. **左＝観点カタログ（採用中／未採用）／右＝選択観点の詳細**。観点追加の入口を左ペインに一元化し、重複追加が構造的に起こらない
2. 未採用の観点も一覧に残す ⇒ **抜け漏れの把握と「検討済み」の証跡**になる
3. 方針（概要）は**クリックで編集**。空のテキストエリアは常設しない
4. チェック項目の判定は **該当 / 非該当 / 未判定 の3値セグメント**（「未」バッジを廃止）
5. **非該当は取り消し線で残す**（削除せず「検討したが対象外」を示せる）
6. AI候補は**選択中の観点に対するチェック項目**を根拠付きで提案し、採用／見送り／すべて採用
7. 章ナビ・配色・タイポは **3a（5. システム要件）／4b（4. KPI）／5c（15. 進捗）と共通**。2ペイン構成は 4b・5c と同思想

## About the Design Files

このバンドルのHTMLは **HTMLで作成したデザインリファレンス（プロトタイプ）** であり、そのまま本番投入するコードではない。意図した見た目と挙動を示すものなので、**対象コードベースの既存環境（React / Vue / Rails など）と既存のパターン・ライブラリで作り直す** ことがタスク。環境が未整備なら適切なフレームワークを選定して実装してよい。

HTML内のインラインスタイルや独自ランタイム（`support.js`）はプレビュー用の仕組みで、実装で真似する必要はない。値（色・サイズ・余白・コピー）と挙動だけを取り出すこと。

ファイル:
- `非機能要件画面 6c 高精度デザイン.dc.html` — **実装対象**（高精度）。ブラウザで直接開けて操作できる
- `要件画面UXワイヤーフレーム.dc.html` — 検討過程の低精度ワイヤー。**ターン6（6a / 6b / 6c）がこの画面の検討**で、6c が採用案（6a・6b は不採用だが「なぜカタログ＋2ペインにしたか」の背景）
- `参考_KPI画面 4b 高精度デザイン.dc.html` / `参考_要件画面 3a 高精度デザイン.dc.html` — 同システムの別章。**共通トークン・章ナビ・2ペイン構成・AI候補パネルの参照元**
- `reference_現状非機能要件画面.png` — 改修前スクリーンショット
- `support.js` — プレビュー用ランタイム（実装不要）

## Fidelity

**High-fidelity（hifi）**。`非機能要件画面 6c 高精度デザイン.dc.html` が最終の配色・タイポグラフィ・余白・状態遷移を持つ。ただし **既存プロダクトのデザインシステムが優先**（緑=primary、琥珀=未判定/要対応、破線=AI由来）。

## Screens / Views

### 画面: 10. 非機能要件 章ページ

**Purpose**
- 作成者（コンサル・提案担当）: 案件に必要な非機能観点を選び、方針を書き、チェック項目を洗い出して判定する
- 確認者（PM）: 観点の抜け漏れと未判定項目を確認する

**Layout**（ルート・3カラムグリッド）
- `display:grid; grid-template-columns: minmax(0,56px) minmax(218px,252px) minmax(0,1fr); min-height:100vh`
- 背景 `#f2efe7`
- 第1列: 章ナビ（**アイコンレール56px 固定**・`position:sticky; top:0; height:100vh`）
- 第2列: 観点カタログ（sticky 全高スクロール、`#faf8f3`、右境界 `1px solid #e3ded2`）
- 第3列: 詳細（`background:#fff`、`min-width:0`、下部にsticky アクションバー）
- 1024px 未満では観点カタログをドロワー/タブに切り替えてよい（詳細を優先表示）

---

#### A. 章ナビ（第1列・幅56px・`#1b1a17`）

5c と同じアイコンレール。
- 上部に `☰` トグル（文字 `#efeae0`、背景 `rgba(239,234,224,.1)`、`radius 7px`、padding `9px 10px`）
- 下に章番号を縦に列挙: `08` `09` `11` `15`（Mono 500/10px/`#8d8778`）、現在章 `10` は 700/11px/`#fff` ＋ 背景 `#2b2924` / `radius 6px` / padding `7px 6px`
- 展開時（176px）の仕様は 3a / 4b / 5c と同一（案件名・全体進捗・章リスト・確定判定ダッシュボード）

---

#### B. 観点カタログ（第2列）

**ヘッダー**（padding `18px 16px 13px`、下境界 `1px solid #e3ded2`、`gap:10px`）
- 「CHAPTER 10 / 15」Mono 500/11px/letter-spacing `.14em`/`#6f6a5e`
- 章名 `<h1>`「非機能要件」Shippori Mincho 600/22px/1.25
- **判定進捗**: 高さ4pxのバー（トラック `#e8e3d8`、フィル `#2f5d45`、`radius 3px`）＋ 右に `9/9` 形式（Mono 500/11px/`#6f6a5e`）
- 補足「判定済のチェック項目 / 採用観点の全項目」400/11px/1.5/`#6f6a5e`

**「採用中」セクション**
- ラベル行: 「採用中」Mono 500/10.5px/letter-spacing `.1em`/`#6f6a5e` ＋ 件数（Mono 500/10.5px/`#7a7466`）＋ 右端「⠿ で並べ替え」400/10.5px/`#6f6a5e`
- 各行（padding `10px`、`radius 8px`、`gap:9px`、`cursor:pointer`、hover 背景 `#f1ede2`）
  - 左端 `3px solid`（選択中 `#1b1a17` / 非選択 `transparent` — 幅が動かないよう常に確保）、選択中の背景 `#fff`
  - 状態ドット7px: **確定済 `#2f5d45` / 未判定あり `#d9a341` / 未判定なし・未確定 `#cdc6b6`**
  - 観点名（選択中 700 / 他 400、12.5px/1.4、1行省略）
  - 右端に `判定済/全項目`（Mono 400/10px/`#7a7466`）
- 行はドラッグで並べ替え可（**提案書の掲載順**）

**「未採用」セクション**
- ラベル行: 「未採用」＋件数
- 各行（padding `9px 10px`）: 観点名 400/12.5px/**`#6f6a5e`（採用中より淡く）** ＋ 右端に `採用` ボタン（文字 `#2f5d45` / 背景 `#fff` / 枠 `1px solid #cfd9d2` / `radius 6px` / padding `6px 10px` / 500/11px、hover 背景 `#f0f5f1`）
- 末尾に `＋ 独自の観点を作る`: 破線ボタン（枠 `1px dashed #cdc6b6`、`radius 8px`、padding `10px`、左padding `14px`、400/12px/`#6f6a5e`、hover: 背景 `#fff` / 文字 `#2f5d45` / 枠 `#a9c3b4`）

**フッター**（上境界 `1px solid #e3ded2`、padding `12px 14px 14px`）
- 「採用した観点だけが提案書に出力されます。未採用のまま残すことで「検討済み」の証跡になります。」400/11px/1.6/`#6f6a5e`、`text-wrap:pretty`

> **未採用リストの初期値**は標準観点マスタ（IPA 非機能要求グレードの大分類など）から、採用済みを除いたもの。採用すると未採用リストから消え、採用解除で戻る ⇒ **同じ観点が2つできる余地がない**（現状の「可用性が2枚」問題の構造的解決）。

---

#### C. 詳細（第3列・背景 `#fff`）

**C-1. ヘッダー**（padding `18px 26px 14px`、背景 `#faf8f3`、下境界 `1px solid #e3ded2`、`gap:10px; flex-wrap:wrap`）
- パンくず「非機能要件 ›」400/11.5px/`#6f6a5e`
- 観点名ピル: 文字 `#1b1a17` / 枠 `1px solid #1b1a17` / `radius 20px` / padding `5px 11px` / 500/11px
- ステータスピル
  - 確定済: 「✓ 確定済」`#2f5d45` / `#eaf1ec` / 枠 `#cfd9d2`
  - 未判定あり: 「未判定 N」`#8a5a18` / `#fbf1de` / 枠 `#ebd7b0`
  - 未判定なし・未確定: 「判定完了」`#3c382f` / `#fff` / 枠 `#e3ded2`
- 右端「更新 12分前 · 佐藤」Mono 400/11px/`#7a7466`
- `AI素案を生成` — primary（背景 `#2f5d45` / 文字 `#fff` / `radius 8px` / padding `10px 14px` / 500/12px、hover `#254a37`）

**C-2. 方針フィールド**（padding `20px 26px 0`、セクション間 `gap:18px`）
- ラベル「この観点の方針」Mono 500/10.5px/letter-spacing `.1em`/`#6f6a5e`
- 値: 枠 `1px solid #d8d2c4`、`radius 10px`、padding `14px 16px`、背景 `#faf8f3`、**500/15px/1.75**、`text-wrap:pretty`、`cursor:text`、hover 枠 `#b3ac9c`。クリックでインライン編集（textarea / contenteditable）
- 補助「クリックで編集できます（空のテキストボックスは常設しません）。」400/11px/`#6f6a5e`

**C-3. チェック項目**
- 見出し行（`gap:10px; flex-wrap:wrap`）
  - 「チェック項目」Mono 500/10.5px/`.1em`/`#6f6a5e` ＋ 件数（Mono 500/10.5px/`#7a7466`）
  - 右端に白ボタン2つ: `標準項目から選ぶ`（観点マスタの定型チェック項目から複数選択）／`未判定をまとめて非該当に`（500/11.5px、枠 `#d8d2c4`、`radius 7px`、padding `8px 12px`、hover `#f4f1e9`）
- **項目行**（`display:flex; align-items:center; gap:13px`、padding `12px 14px`、枠 `1px solid #e3ded2`、`radius 10px`）
  - **左端 3px の判定カラー**: 該当 `#2f5d45` / 非該当 `#b3ac9c` / 未判定 `#d9a341`
  - 背景: 未判定 `#fff`（目立たせる）／判定済 `#faf8f3`
  - ドラッグハンドル `⠿`（Mono 400/12px/`#b3ac9c`/`cursor:grab`）
  - 本文 400/13.5px/1.7、`text-wrap:pretty`。**非該当は `text-decoration: line-through`**
  - **3値セグメント**（`display:flex`、各ボタン padding `7px 11px` / 500/11px、外側だけ `radius 7px`、内側は `border-left:none`）
    - 該当 選択時: 背景 `#eaf1ec` / 文字 `#2f5d45` / 枠 `#2f5d45`
    - 非該当 選択時: 背景 `#1b1a17` / 文字 `#f6f3ec` / 枠 `#1b1a17`
    - 未判定 選択時: 背景 `#fbf1de` / 文字 `#8a5a18` / 枠 `#d9a341`
    - 非選択: 背景 `#fff` / 文字 `#3c382f` / 枠 `#d8d2c4`
  - `⋯` — 白ボタン（Mono 500/12px、枠 `#d8d2c4`、`radius 7px`、padding `7px 9px`）。中身: **編集 / 別の観点へ移動 / 複製 / 削除**
- 末尾 `＋ チェック項目を追加（Enterで連続入力）`: 破線ボタン（`radius 10px`、padding `13px`、左padding `16px`、400/12.5px/`#6f6a5e`、hover: 背景 `#faf8f3` / 文字 `#2f5d45` / 枠 `#a9c3b4`）

**C-4. AI候補パネル**（候補があるときのみ表示）
- 枠 `1px solid #cfd9d2`、`radius 12px`、背景 `#f7faf8`、`overflow:hidden`
- ヘッダー（padding `12px 15px`、下境界 `1px solid #e0e8e3`）
  - 「AI候補のチェック項目」Shippori Mincho 600/13px
  - 説明「〈観点名〉の方針と5. システム要件を参照しています」400/11px/`#6f6a5e`
  - 右端 `すべて採用`（文字 `#2f5d45` / 枠 `1px solid #cfd9d2` / hover 背景 `#f0f5f1`）
- 候補カード（`gap:9px`、`rise` 180ms で出現）
  - 背景 `#fff`、枠 `1px solid #dfe7e2`、`radius 10px`、padding `12px 13px`、`display:flex; gap:12px; align-items:flex-start`
  - 左: 「AI素案」チップ（Mono 500/10px、**破線 `1px dashed #cdc6b6`**、`radius 20px`、padding `4px 7px`）
  - 中央: 候補本文 500/13.5px/1.65 ＋ 「根拠：…」400/11.5px/1.6/`#6f6a5e`
  - 右: `採用`（primary 小・padding `8px 12px`）／`見送り`（白・文字 `#6f6a5e`）を縦積み

**C-5. アクションバー（sticky bottom）**
- `position:sticky; bottom:0`、上境界 `1px solid #e3ded2`、背景 `#faf8f3`、padding `13px 26px`、`gap:10px; flex-wrap:wrap`
- 未確定: `この観点を確定` — primary（padding `11px 18px`、`box-shadow 0 1px 2px rgba(27,26,23,.14)`）
- 確定済: 「✓ 確定済」状態表示（文字 `#2f5d45` / 背景 `#eaf1ec` / 枠 `1px solid #cfd9d2` / padding `11px 16px`）
- `この観点を採用しない` — 白ボタン（採用解除＝左の未採用リストへ戻す）
- `⋯` — 白ボタン（Mono 500/13px）。中身: **観点名を変更 / 複製 / 標準項目を再読込 / 削除**
- 右端（`margin-left:auto`）`次の観点へ →` — 白ボタン

## Interactions & Behavior

1. **観点選択** — 左カタログの採用中の行をクリック。右ペインが即切替（方針・チェック項目・ステータス・件数）
2. **観点の採用** — 未採用リストの `採用` で採用中の末尾に追加し、**その観点を選択状態にする**。方針は「（この観点の方針を入力）」のプレースホルダで、チェック項目は空。未採用リストからは消える
3. **観点の採用解除** — `この観点を採用しない` で未採用リストへ戻す。**方針とチェック項目は保持**し、再採用したら復元する（破棄はしない）。採用中が0件になる操作は不可
4. **独自の観点を作る** — 名称を入力して採用中に追加（標準マスタには追加しない、案件固有）
5. **判定** — 3値セグメントのワンタップ。`該当`／`非該当`／`未判定`。左端カラー・背景・取り消し線・ステータスピル・進捗バー・左カタログの `判定済/全項目` とドットが即時更新
6. **未判定をまとめて非該当に** — 選択中観点の `未判定` を全て `非該当` に（取り消し線つきで残る）。実行前に件数を出して確認するのが望ましい
7. **AI候補生成** — `AI素案を生成` で、**選択中の観点の方針＋他章（5. システム要件・4. KPI等）の確定済内容**を参照したチェック項目候補を2件生成。候補には必ず**「根拠」1文**を返させる（UIが根拠を前提にしている）
   - `採用` すると **`未判定` のチェック項目として追加**（`source:'ai'`）。判定は人が行う
   - `すべて採用` で残り全件を追加。`見送り` は候補から除去し、サーバ側に却下を記録して再生成時に同案を出さない
   - 生成中はボタンを無効化し、候補位置にスケルトン（`#e8e3d8`）を出す（4b と同仕様）
8. **チェック項目の追加** — 破線ボタンまたは `Enter` で連続入力。追加直後は `未判定`。`標準項目から選ぶ` は観点マスタの定型項目を複数選択で取り込む（既存と重複する項目は選択不可にする）
9. **並べ替え・移動** — チェック項目は `⠿` でドラッグ（観点内）。`⋯` の「別の観点へ移動」で観点間の移動。観点自体も左カタログでドラッグ並べ替え（提案書の掲載順）
10. **確定** — `この観点を確定` で `confirmed`。**未判定が残っている場合は確認ダイアログ**（「未判定 N 件が残っていますが確定しますか？」）
11. **次の観点へ** — 採用中リストの次へ巡回（末尾なら先頭へ）。15章を流し作業で進める前提
12. **インライン編集** — 方針・チェック項目本文はクリックで編集、blur / `⌘Enter` で保存（オートセーブ、デバウンス 600ms）、`Esc` で取消
13. **レスポンシブ** — ヘッダーのボタン群・項目行・候補カード・アクションバーはすべて `flex-wrap:wrap`。項目行が狭いときはセグメントを本文の下に折り返す
14. **アクセシビリティ** — 3値セグメントは `role="radiogroup"` / `aria-checked`。**判定は色だけでなくラベルテキストで判別できる**（該当/非該当/未判定の文字が常に出ている）。非該当の取り消し線は視覚補助であり、状態の唯一の手掛かりにしない
15. **ローディング / エラー** — 保存失敗時は楽観更新をロールバックしトーストで通知。AI生成失敗は候補パネル内にインラインエラー（文字 `#8f3a22` / 背景 `#fbeae5` / 枠 `#efcbc0`）＋`再試行`

## State Management

サーバ側データ:
- `AspectMaster`: `{ id, name, order, defaultItems: string[] }` — 標準観点マスタ（IPA 非機能要求グレード等）。全案件共通
- `Aspect`（案件で採用した観点）: `{ id, chapterId, masterId | null, name, order, policy, adopted: boolean, confirmed: boolean, updatedAt, updatedBy }`
  - `adopted: false` でも**レコードは残す**（採用解除しても方針・項目を保持するため）
  - `masterId: null` は独自観点
- `CheckItem`: `{ id, aspectId, order, text, judgement: 'yes'|'no'|'unknown', source: 'human'|'ai'|'master', createdFromCandidateId, note }`
- `Candidate`: `{ id, aspectId, text, why, round, state: 'open'|'adopted'|'rejected' }`

UI状態:
- `selectedAspectId: string`
- `candidates: Record<aspectId, Candidate[]>`（open のみ表示）
- `loadingFor: aspectId | null`、`round: number`（再生成の重複回避）
- `editing: { targetId, field } | null`
- `navCollapsed: boolean`（既定 true）

派生値（計算で出す。保存しない）:
- 観点ごとの `判定済/全項目`、未判定件数、状態ドット
- 章全体の判定進捗（採用観点の全項目に対する判定済の比率）
- 未採用リスト = `AspectMaster` ∪ 独自観点 − 採用中

主な操作:
- `selectAspect(id)`
- `adoptAspect(masterId | name)` → `adopted: true`（既存レコードがあれば復活）
- `unadoptAspect(id)` → `adopted: false`（削除しない）
- `updatePolicy(aspectId, text)` / `confirmAspect(aspectId)`
- `setJudgement(itemId, 'yes'|'no'|'unknown')`
- `bulkSetUnknownTo(aspectId, 'no')`
- `addItem(aspectId, text)` / `importMasterItems(aspectId, itemIds[])` / `moveItem(itemId, toAspectId, toOrder)` / `removeItem(itemId)`
- `generateCandidates(aspectId)` / `adoptCandidate(aspectId, candidateId)` / `rejectCandidate(...)`
- `reorderAspects(id, newOrder)`

データ取得: 章表示時に観点・チェック項目・観点マスタを1回で取得（数十件規模）。判定変更は PATCH（一括判定は複数IDを1リクエストで）。

## Design Tokens

3a / 4b / 5c と共通。

### Colors
| 用途 | 値 |
|---|---|
| ページ地 | `#f2efe7` |
| カタログ地・ヘッダー地・判定済項目地 | `#faf8f3` |
| 詳細ペイン地・未判定項目地 | `#ffffff` |
| AI候補パネル地 | `#f7faf8`（境界 `#e0e8e3` / 外枠 `#cfd9d2` / カード枠 `#dfe7e2`） |
| 主要テキスト | `#1b1a17` |
| 副テキスト | `#3c382f` |
| 補助テキスト（未採用観点名・注記） | `#6f6a5e` |
| メタ（Mono） | `#7a7466` |
| 罫線 | `#e3ded2` |
| ボタン枠 | `#d8d2c4` / 破線 `#cdc6b6` / hover枠 `#b3ac9c` |
| hover 地 | `#f4f1e9` / カタログ行 `#f1ede2` |
| primary（緑・該当） | `#2f5d45` / hover `#254a37` / 淡地 `#eaf1ec` / 枠 `#cfd9d2` / hover地 `#f0f5f1` |
| 未判定（琥珀） | 文字 `#8a5a18` / 地 `#fbf1de` / 枠 `#d9a341` `#ebd7b0` / ドット `#d9a341` |
| 非該当（反転） | 地 `#1b1a17` / 文字 `#f6f3ec` / 左端カラー `#b3ac9c` |
| 未着手ドット | `#cdc6b6` |
| エラー（赤茶） | 文字 `#8f3a22` / 地 `#fbeae5` / 枠 `#efcbc0` |
| ダーク面（章ナビ） | `#1b1a17` / 現在章 `#2b2924` |
| ダーク面上テキスト | `#fff` / `#efeae0` / `#8d8778` |
| 進捗バートラック / スケルトン | `#e8e3d8` |

> **AI由来は「破線」で統一**（`1px dashed #cdc6b6`）。判定の色（緑・黒・琥珀）と衝突しない。

### Typography
- 見出し: **Shippori Mincho** 600 — 章名 22px/1.25、パネル見出し 13px
- UI: **Zen Kaku Gothic New**
  - 方針 500/15px/1.75
  - チェック項目本文 400/13.5px/1.7
  - 候補本文 500/13.5px/1.65
  - カタログ行 12.5px/1.4（選択中 700 / 他 400）
  - ボタン 500/11〜13px、セグメント 500/11px
  - 注記 400/11〜11.5px/1.5〜1.6
- ラベル・数値: **IBM Plex Mono** 400/500 — フィールドラベル 10.5px（letter-spacing `.1em`）、章ラベル 11px（`.14em`）、件数・比率 10〜11px、AIチップ 10px
- 長文には `text-wrap: pretty`

### Spacing
`4 / 5 / 6 / 7 / 9 / 10 / 11 / 12 / 13 / 14 / 15 / 16 / 18 / 20 / 26` px
- 詳細 padding `20px 26px 0`、アクションバー `13px 26px`、ヘッダー `18px 26px 14px`
- カタログヘッダー `18px 16px 13px`、カタログ行 `10px`
- チェック項目 padding `12px 14px`、項目間 `gap:10px`、セクション間 `gap:18px`

### Radius
`3px`（進捗バー）/ `6px`（採用ボタン）/ `7px`（小ボタン・セグメント外側）/ `8px`（ボタン・カタログ行）/ `10px`（方針・項目行・候補カード・破線追加ボタン）/ `12px`（AI候補パネル）/ `20px`（ピル・AIチップ）/ `50%`（ドット）

### Shadow
- primaryボタン（アクションバー）: `0 1px 2px rgba(27,26,23,.14)`
- それ以外は影を使わない（枠線で構造を示す）

### Motion
- `rise`: `opacity 0→1` ＋ `translateY(6px)→0` / 180ms ease（候補カード出現）
- hover: `background-color / border-color 120ms ease`

## Assets

- 画像・アイコンフォントは未使用。記号はテキストグリフのみ: `☰`（ナビ）`⠿`（ドラッグ）`✓`（確定）`⋯`（メニュー）`›`（パンくず）`→`（次へ）`＋`（追加）
  - 実装では既存アイコンセット（menu / drag-handle / check / ellipsis / arrow / plus）に置き換え推奨
- フォントは Google Fonts: Shippori Mincho / Zen Kaku Gothic New / IBM Plex Mono。既存の和文フォントがあればそちらを優先し、「見出しに明朝・ラベルと数値にモノスペース」の役割分担だけ踏襲すること
- `reference_現状非機能要件画面.png` — 改修前の状態（実装対象ではない）
- **観点マスタ・標準チェック項目の実データは未確定**。プロトタイプの文言（運用保守性・可用性・性能拡張性の各項目）はサンプル。実装時に正式なマスタを差し替えること

## Files

- `非機能要件画面 6c 高精度デザイン.dc.html` — 実装対象。上部がマークアップ、下部 `class Component extends DCLogic` に状態ロジック（3値判定 `setJ`、採用／採用解除、一括非該当 `bulkUnknownToNa`、AI候補 `suggest`／`adopt`、進捗の派生計算はここを参照。`suggest()` のダミー文言は実装時にAPIへ差し替え）
- `要件画面UXワイヤーフレーム.dc.html` — 検討案（ターン6の 6c が採用案）
- `参考_KPI画面 4b 高精度デザイン.dc.html` / `参考_要件画面 3a 高精度デザイン.dc.html` — 同システムの別章（共通トークン・2ペイン構成・AI候補パネルの参照元）
- `reference_現状非機能要件画面.png` — 改修前スクリーンショット
- `support.js` — プレビュー用ランタイム（実装不要）
