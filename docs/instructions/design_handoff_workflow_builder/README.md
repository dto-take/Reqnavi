# Handoff: 業務フロー要件定義ビルダー（Workflow Requirements Builder）

## Overview
システム開発の要件定義工程で使う「業務フロービルダー」のUI。業務フローを **誰が（アクター）／何を（作業内容）／どの機能で（システム・機能・画面ID）** の3軸で可視化・編集し、そこから業務手順表とユースケース記述を自動生成する。題材ダミーデータは「商談管理＋見積提出」業務。

3ペイン構成:
- 左サイドバー: 追加可能な工程ノード一覧＋アクター（レーン）凡例
- 中央: スイムレーン形式のフロー図 ／ 業務手順表（タブ切替）
- 右パネル: 選択ノードの詳細編集フォーム＋自動生成ユースケース記述

## About the Design Files
このバンドルに含まれる `.dc.html` は **HTMLで作成したデザインリファレンス（プロトタイプ）** であり、そのまま本番投入するコードではない。意図した見た目・情報構造・インタラクションを示すためのものである。

タスクは、これらのHTMLデザインを **対象コードベースの既存環境（React / Vue / SwiftUI / ネイティブ等）の確立されたパターンとライブラリで作り直すこと**。まだ環境が無い場合は、プロジェクトに最適なフレームワークを選定した上で実装する。HTMLのマークアップやインラインスタイルをコピーするのではなく、既存のコンポーネント体系（Button, Select, Input, Table, Tabs など）にマッピングすること。

推奨実装スタック（新規の場合）: React + TypeScript + Tailwind CSS。フローのレイアウト計算は自前ロジック（本ドキュメントのアルゴリズム節）でも、React Flow 等のライブラリでも良いが、**スイムレーン（アクター＝列）固定配置**が要件なので、ノードの x 座標はアクターで決定される制約を必ず満たすこと。

## Fidelity
**High-fidelity (hifi)**。色・タイポグラフィ・余白・角丸・影・状態変化まで確定値で作られている。UIは本ドキュメントの数値どおりにピクセル忠実で再現し、スタイル指定は対象コードベースの既存トークン／ユーティリティに置き換えて実装する。

> カラーは本ドキュメント「Design Tokens」の値（プロトタイプで採用したデザインコンセプト）を優先する。対象コードベースに既存トークンがある場合も、ここに記載のhexへ最も近い値ではなく **記載のhexそのもの** を正とし、必要ならトークンを追加する。

---

## Screens / Views

アプリは単一画面（3ペイン固定レイアウト）＋中央エリアの2タブ。

### 全体シェル
- ルート: `display:flex; flex-direction:column; height:100vh; min-height:640px; background:#f8fafc; color:#0f172a; font-size:14px`
- ヘッダー（高さ56px, `flex:none`）→ 下に `display:flex; flex:1; min-height:0` の3カラム
- 左サイドバー 264px 固定 / 中央 `flex:1; min-width:0; overflow:auto` / 右パネル 352px 固定
- サイドバー・右パネルの境界は `1px solid #e2e8f0`、背景 `#ffffff`

### 1. ヘッダー
用途: 対象業務の識別、タブ切替、工程数の把握、定義書への反映アクション。

- コンテナ: `height:56px; padding:0 20px; gap:14px; background:#ffffff; border-bottom:1px solid #e2e8f0; white-space:nowrap; overflow:hidden`
- ロゴマーク: 26×26, `border-radius:7px`, 背景 `#4f46e5`、中に白ストロークのアイコン（横線＋縦線／レーンを表すグリフ）15×15, `stroke-width:2.2`
- プロダクト名「業務フロー要件定義ビルダー」: 15px / 700 / `letter-spacing:.02em` / `flex:none`
- 縦区切り: 1×22px `#e2e8f0`
- ドキュメントタイトル群（`flex:1 1 auto; min-width:0; overflow:hidden`、はみ出しは ellipsis）
  - 「商談管理＋見積提出 業務フロー」13px / 500
  - 「要件定義 Rev.0.3 ・ 最終更新 12:41」11px / `#94a3b8`
- タブ群（セグメンテッドコントロール, `flex:none`）: 外枠 `padding:3px; border-radius:8px; background:#f1f5f9`
  - タブボタン: `padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:500`
  - 選択中: `background:#ffffff; color:#0f172a; box-shadow:0 1px 2px rgba(15,23,42,.12)`
  - 非選択: `background:transparent; color:#64748b; box-shadow:none`
  - ラベル: 「フロー図」/「業務手順表」
- 工程カウンタ: `padding:5px 10px; border-radius:6px; background:#f1f5f9; font-size:12px; color:#475569`。数値は IBM Plex Mono 500 `#0f172a`、後ろに「工程」
- セカンダリボタン「整合性チェック」: `padding:7px 14px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:13px; font-weight:500` / hover `background:#f8fafc; border-color:#94a3b8`
- プライマリボタン「定義書に反映」: `padding:7px 16px; border-radius:6px; background:#4f46e5; border:1px solid #4f46e5; color:#fff` / hover `background:#4338ca`

### 2. 左サイドバー（ノードパレット）
用途: 工程ノードの追加、アクターごとの工程数の確認。

- 見出し「工程を追加」12px / 700 / `letter-spacing:.04em`、`padding:16px 16px 10px`
- 直下に **挿入先ヒント**（11px / `#94a3b8` / `line-height:1.5`）。文言は状態依存（後述「Interactions」）
- スクロール領域: `padding:0 12px 16px; gap:16px`
- グループ見出し: 10px / 700 / `#94a3b8` / `letter-spacing:.08em` / `padding:0 4px`
  - 「ベーシック」: 開始, 終了
  - 「人が行う工程」: 手動タスク, 承認
  - 「分岐・システム処理」: 条件分岐, 自動通知, 自動処理
- パレット項目ボタン: `display:flex; gap:10px; padding:9px 10px; border-radius:8px; border:1px solid #e2e8f0; background:#fff; text-align:left` / hover `border-color:#a5b4fc; background:#f5f3ff`
  - アイコンチップ: 30×30, `border-radius:8px`, 背景＝ノード種別の tint、内側に16×16 SVG（stroke＝種別color, `stroke-width:2`, linecap/linejoin round）
  - ラベル 13px / 500、説明 11px / `#94a3b8` / `line-height:1.3`
- 最下部「アクター（レーン）」凡例: 各行 `padding:6px 8px; border-radius:7px; background:#f8fafc`、左に 8×8 `border-radius:3px` のアクター色、名前 12px `#334155`、右端に工程数（IBM Plex Mono 11px `#94a3b8`）

#### ノード種別マスタ（`type` → 表示）
| type | ラベル | color | tint | 説明文 | 既定アクター | 既定 mode |
|---|---|---|---|---|---|---|
| start | 開始 | `#059669` | `#d1fae5` | 業務の起点イベント | 営業担当 | 手動 |
| task | 手動タスク | `#4f46e5` | `#e0e7ff` | 人がシステムを操作 | 営業担当 | 手動 |
| approval | 承認 | `#7c3aed` | `#ede9fe` | 承認・却下の判断 | 営業担当 | 手動 |
| condition | 条件分岐 | `#d97706` | `#fef3c7` | Yes / No に分岐 | システム | 自動 |
| notify | 自動通知 | `#0284c7` | `#e0f2fe` | メール・Slack送信 | システム | 自動 |
| action | 自動処理 | `#0d9488` | `#ccfbf1` | バッチ・外部API連携 | システム | 自動 |
| end | 終了 | `#64748b` | `#e2e8f0` | 業務の終端 | 営業担当 | 手動 |

アイコン（24×24 viewBox / `fill:none` / stroke＝種別color）の `d`:
- start: `M5 3l14 9-14 9z`
- task: `M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9`
- approval: `M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM9 12l2 2 4-4`
- condition: `M12 3l9 9-9 9-9-9z`
- notify: `M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.5 21a2 2 0 0 0 3 0`
- action: `M13 2L3 14h7l-1 8 10-12h-7z`
- end: `M6 6h12v12H6z`

#### アクターマスタ（レーン定義・順序が列順）
| # | name | role（サブラベル） | color |
|---|---|---|---|
| 0 | 顧客 | 社外 | `#0891b2` |
| 1 | 営業担当 | 営業部 | `#4f46e5` |
| 2 | 営業マネージャー | 承認者 | `#7c3aed` |
| 3 | 見積・内勤 | 営業事務 | `#0d9488` |
| 4 | システム | 自動処理 | `#64748b` |

未知のアクター名は最終レーン（システム）にフォールバック。

### 3. 中央タブA: スイムレーン フロー図
用途: 「誰が」を列、「工程順」を行として業務の流れと分岐を読み取る。

- 外側スクロールコンテナ = `<main>`（縦横スクロール）。内側は `width: laneCount × laneWidth`（既定 5×268 = 1340px）, `min-width:100%`
- **レーンヘッダー**: `position:sticky; top:0; z-index:6; display:flex; background:#fff; border-bottom:1px solid #cbd5e1; box-shadow:0 1px 3px rgba(15,23,42,.06)`
  - 各セル: `width:laneWidth; padding:11px 14px; border-right:1px solid #e2e8f0; gap:8px`
  - 左に 6×26 `border-radius:3px` アクター色バー、右に名前 12.5px/700（ellipsis）＋ role 10.5px `#94a3b8`
- **キャンバス**: `position:relative; height: canvasH`。クリックで選択解除
  - レーン背景ストライプ: 各レーン `position:absolute; top:0; bottom:0; left:i×laneWidth; width:laneWidth; border-right:1px solid #e2e8f0; background: i%2 ? '#f8fafc' : '#ffffff'; pointer-events:none`
  - コネクタSVG: `position:absolute; inset:0(left/top 0, width/height 100%); overflow:visible; pointer-events:none`。`<path fill=none stroke=edge.color stroke-width=2 linecap/linejoin=round [stroke-dasharray]>` ＋終端に `<circle r=3.5 fill=edge.color>`
  - 分岐ラベルピル（HTML, SVGの上）: `position:absolute; transform:translate(-50%,-50%); padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; letter-spacing:.04em; box-shadow:0 1px 2px rgba(15,23,42,.06)`
    - Yes: `background:#ecfdf5; color:#047857; border:1px solid #a7f3d0`
    - No: `background:#fff1f2; color:#be123c; border:1px solid #fecdd3`

#### 工程カード
- サイズ: `width = laneWidth - 40`（既定 228px）, 高さ実質 100px（compact時 84px）
- `padding:11px 12px; border-radius:11px; background:#fff; border:1.5px solid; gap:7px; cursor:pointer`
- 非選択: `border-color:#e2e8f0; box-shadow:0 1px 2px rgba(15,23,42,.06)`
- 選択: `border-color:<accent>; box-shadow:0 0 0 3px <accent>26, 0 8px 18px -8px rgba(15,23,42,.3)`（`26` は 15% alpha の16進サフィックス）
- 1行目: 22×22 アイコンチップ（`border-radius:6px`, 背景 tint, 内 13×13 SVG `stroke-width:2.2`）／種別ラベル 10px 700 `letter-spacing:.06em` 種別color（ellipsis, `flex:1`）／工程番号 IBM Plex Mono 10px `#94a3b8`（2桁ゼロ埋め）／区分チップ `padding:1px 6px; border-radius:4px; font-size:9.5px; font-weight:700`
  - 自動: `background:#f1f5f9; color:#475569` ／ 手動: `background:#eef2ff; color:#4338ca`
- 2行目: 作業内容 13.5px / 500 / `line-height:1.4` / `#0f172a`
- 3行目（`padding-top:7px; border-top:1px dashed #e2e8f0`）: 12×12 モニターアイコン（stroke `#94a3b8`, `d="M3 5h18v11H3zM8 20h8"`）／システム・機能名 11px `#475569`（ellipsis, 未入力時「（システム未定義）」）／画面ID チップ IBM Plex Mono 10px `#64748b`, `background:#f1f5f9; padding:1px 5px; border-radius:4px`（未入力時「—」）

#### 空ブランチのスタブ
- 条件分岐の Yes / No が空の場合、そのルートの行に破線カードを表示
- `padding:16px; border-radius:11px; border:1.5px dashed; font-size:12.5px; font-weight:500`＋15×15 プラスアイコン、テキスト「Yes ルートに工程を追加」/「No ルートに工程を追加」
- 通常: `background:#fff; border-color:#cbd5e1; color:#64748b`
- 挿入先として選択中: Yes → `background:#ecfdf5; border-color:#10b981; color:#047857` ／ No → `background:#fff1f2; border-color:#f43f5e; color:#be123c`
- スタブへ向かうコネクタは破線 `stroke-dasharray:"5 4"`

### 4. 中央タブB: 業務手順表
用途: 「誰が / 何を / どの機能で」を定義書向けの表形式で確認・修正対象を特定。

- ラッパ `padding:20px; min-width:1080px`
- 見出し「業務手順表（誰が / 何を / どの機能で）」15px/700、サブ「フロー図から自動生成 ・ 分岐ルートは Yes / No 列で区別されます」11.5px `#94a3b8`
- 右上にセカンダリボタン「CSVで書き出す」（ヘッダーのセカンダリボタンと同スタイル、`font-size:12.5px`）
- テーブル外枠: `background:#fff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden`
- グリッド列定義（ヘッダー行・データ行で共通）: `52px 132px 60px 1.15fr 64px 1.1fr 92px 1fr 1fr`
- ヘッダー行: `background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:10.5px; font-weight:700; color:#475569; letter-spacing:.04em`、各セル `padding:9px 10px`、2列目以降に `border-left:1px solid #e2e8f0`
- 列: No / アクター（誰が）/ ルート / 作業内容（何を）/ 区分 / 利用システム・機能 / 画面ID / 入力データ / 出力データ
- データ行: `border-bottom:1px solid #f1f5f9; font-size:12px; cursor:pointer`、セル `padding:10px`、2列目以降 `border-left:1px solid #f1f5f9`
  - hover `background:#f5f3ff`、選択行 `background:#eef2ff`（非選択は `#ffffff`）
  - No: IBM Plex Mono `#64748b`
  - アクター: 6×6 `border-radius:2px` アクター色＋名称（ellipsis）
  - ルート: ピル `padding:1px 7px; border-radius:999px; font-size:10px; font-weight:700`。本線 `#f1f5f9/#64748b`、Yes `#ecfdf5/#047857`、No `#fff1f2/#be123c`
  - 作業内容: 500 ＋下に種別ラベル 10.5px `#94a3b8`
  - 区分: カードと同じ手動/自動チップ（`font-size:10px`）
  - 画面ID: IBM Plex Mono 11px `#64748b`
  - 入力/出力: `#475569`, `line-height:1.5`、空は「—」
- 行クリックで同ノードを選択（右パネルが切り替わる。タブは移動しない）

### 5. 右パネル（設定フォーム＋ユースケース記述）
未選択時: 中央寄せの空状態。44×44 `border-radius:12px; background:#f1f5f9` のアイコン枠（20×20 stroke `#94a3b8`, `d="M4 5h16M4 12h10M4 19h7"`）／「工程が未選択です」13px/500 `#475569`／「レーン上のカード、または手順表の行を<br>クリックすると詳細を編集できます。」11.5px `#94a3b8` `line-height:1.6`

選択時のヘッダ（`padding:16px; border-bottom:1px solid #e2e8f0`）:
- 34×34 アイコンチップ（`border-radius:9px`, 背景 tint, 17×17 SVG）
- 種別ラベル 10px/700 `letter-spacing:.06em` 種別color
- 作業内容 14px/700（ellipsis）
- 「工程 07 ・ ID n7」IBM Plex Mono 10.5px `#94a3b8`

フォーム本体（`padding:16px; gap:18px; overflow-y:auto`）。共通スタイル:
- ラベル: 11.5px / 700 / `#334155`（サブラベルは 10.5px / `#64748b`）
- input / select / textarea: `padding:8px 10px; border-radius:7px; border:1px solid #cbd5e1; font-size:13px; background:#fff`（textareaは 12.5px, `line-height:1.6`, `resize:vertical`）
- フォーカス: `outline:2px solid #6366f1; outline-offset:-1px`
- placeholder色 `#94a3b8`

フィールド一覧（上から）:
1. **作業内容（何を）** — text, placeholder「例: 見積内容の承認」
2. **アクター（誰が）** — select（アクターマスタ）／**実行区分** — select（手動 / 自動）幅104px固定
3. **利用システム・機能（どの機能で）** — グループ枠 `padding:12px; border-radius:9px; background:#f8fafc; border:1px solid #e2e8f0`
   - システム名＋機能名: 自由入力 text, placeholder「例: SFA / 見積作成機能」
   - 画面 / API ID: text（幅132px, IBM Plex Mono 12px, placeholder「QUO-010」）
   - システム区分: select（社内システム / 外部連携 / システム外（手作業））
   - 内側の小コントロールは `padding:7px 9px; border-radius:6px; font-size:12px`
4. **入力データ** / **出力データ** — 横並び textarea（rows=3）
5. **分岐ルール**（`type === 'condition'` のみ）
   - 見出し行右に AND/OR select（`padding:4px 8px; border-radius:6px; font-size:11.5px`、値 `all`＝すべて満たす(AND) / `any`＝いずれか満たす(OR)）
   - ルールカード: `padding:10px; border-radius:9px; background:#fffbeb; border:1px solid #fde68a`
     - 項目 select（ルール項目マスタ）／演算子 select（幅62px, `text-align:center`）／値 input（IBM Plex Mono）／削除ボタン 28×28 `border-radius:6px; border:1px solid #fcd34d; color:#b45309` hover `background:#fef3c7`（13×13 の×アイコン）
     - 内側コントロール枠線は `#fcd34d`, `font-size:12px`
   - 「＋ ルールを追加」: `padding:8px; border-radius:7px; border:1px dashed #cbd5e1; color:#475569; font-size:12px` hover `border-color:#94a3b8; background:#f8fafc`
   - Yes/No ルート要約カード（横並び）: Yes `background:#ecfdf5; border:1px solid #a7f3d0`（見出し 10px/700 `#047857`、本文 11.5px `#065f46`）／No `background:#fff1f2; border:1px solid #fecdd3`（`#be123c` / `#9f1239`）。本文は「4工程 ・ A → B → C → D」、空なら「ノード未設定」
6. **業務ルール・制約** — textarea（rows=3）, placeholder「例: 値引率20%超は部長承認が必須」
7. **ユースケース記述（自動生成）** — `padding:13px; border-radius:10px; background:#f5f3ff; border:1px solid #ddd6fe`
   - 見出し: 14×14 ドキュメントアイコン（stroke `#6d28d9`, `d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M8 3h8v3H8zM8 12h8M8 16h5"`）＋テキスト 11.5px/700 `#5b21b6`
   - 小見出し「事前条件 / 基本手順 / 事後条件」10px/700 `#7c3aed` `letter-spacing:.06em`
   - 本文 12px `#3730a3` `line-height:1.6`、手順の番号は IBM Plex Mono `#7c3aed`
   - 表示/非表示は `showUseCase` プロップで切替

フッタ（`padding:12px 16px; border-top:1px solid #e2e8f0; background:#f8fafc; gap:8px`）:
- 「工程を削除」: `border:1px solid #fecdd3; color:#be123c; background:#fff` hover `background:#fff1f2`
- 「選択解除」: `border:1px solid #cbd5e1; color:#475569` hover `background:#f1f5f9`
- 両方 `flex:1; padding:8px; border-radius:7px; font-size:12.5px; font-weight:500`

---

## Interactions & Behavior

### 選択
- カード / 手順表の行クリックで `selectedId` を設定し、`insert` をクリア。イベントは `stopPropagation`（キャンバスの空白クリックで選択解除するため）
- キャンバス空白・「選択解除」・ヘッダーのボタン群（デモ）で `selectedId=null, insert=null`

### 工程の追加（挿入位置ルール）
サイドバーのノードをクリックすると以下の優先順で挿入され、追加ノードが選択状態＋タブは「フロー図」へ:
1. `insert = {kind:'branch', id, branch}`（空ブランチのスタブを選択中）→ その分岐の **末尾** に追加
2. ノード選択中 → そのノードの **直後** に追加。ただし選択が条件分岐なら **Yes ルートの先頭** に追加
3. 未選択 → 本線の末尾に追加（末尾が条件分岐なら、そのYesルートを再帰的に辿った末尾）

**重要な不変条件**: 条件分岐ノードを chain の途中に挿入した場合、その位置より後ろの同chain要素は新しい条件分岐の `yes` 配列の先頭側へ移送する（条件分岐は所属chainの終端であることを保証）。これを守らないとレイアウトで後続工程が描画されない。

```
insertAt(chain, index, node):
  chain.splice(index, 0, node)
  if node.type === 'condition':
     node.yes = chain.splice(index + 1).concat(node.yes ?? [])
```

### 工程の削除
- 対象を chain から除去。**条件分岐を削除した場合はその `yes` 配列を同じ位置に展開して本線へ戻す**（`no` ルートは条件分岐と共に削除）
- 削除後は選択解除

### 挿入先ヒントの文言
- `insert` あり: 「Yes ルートの末尾に挿入します」/「No ルートの末尾に挿入します」
- ノード選択中: 「『<作業内容>』の直後に挿入します」
- 未選択: 「フローの末尾に追加します」

### 編集の即時反映
右パネルの各コントロールは `onChange` で対象ノードを更新し、フロー図・手順表・ユースケース記述が即時に再計算される（アクター変更でカードのレーンが移動する）。

### ユースケース記述の生成ロジック
- 事前条件: 直前ノードがあれば「『<直前の作業内容>』が完了していること」＋業務ルールがあれば「／<業務ルール>」／無ければ「フローの起点（事前条件なし）」
- 基本手順（通常ノード）:
  1. `<アクター> が <システム・機能名>（<画面ID or 'ID未定'>）を開く`
  2. `<入力データ or '必要情報'> を入力・確認する`
  3. `<作業内容> を実行する`（mode が自動なら末尾に「（システムが自動実行）」）
- 基本手順（条件分岐）:
  1. `<システム・機能名 or '対象システム'> が <入力データ or '判定対象データ'> を取得する`
  2. `判定条件（すべて満たす|いずれか満たす）: <項目> <演算子> <値>` を ` かつ ` / ` または ` で連結
  3. `成立時は Yes ルート、非成立時は No ルートへ分岐する`
- 事後条件: `<出力データ or '処理結果'> が確定し、` ＋ 次工程があれば「『<次工程>』へ引き継がれる」／条件分岐なら「Yes / No いずれかのルートへ進む」／無ければ「業務が完了する」

### スイムレーン レイアウトアルゴリズム（実装必須ロジック）
定数（既定値）: `laneWidth = 268`（220–340可変）, `cardW = laneWidth - 40`, `NH = 100`（compact 84）, `VG = 52`（compact 34）, `PITCH = NH + VG`

- `laneX(actor) = actorIndex × laneWidth + laneWidth / 2`
- `rowY(row) = 28 + row × PITCH`
- 深さ優先で chain を走査し、各ノードに **行番号**（縦位置）を割り当てる。x はアクターのレーンで決定（フローの分岐で x は変わらない）
- 条件分岐に到達したら:
  - Yes ルートを `row + 1` から配置、消費し終えた次の行を `yesEnd` とする（空なら `row+1` にスタブを置き `yesEnd = row + 2`）
  - No ルートは `yesEnd` から配置（＝Yesルートの下に続けて配置され、行の衝突が起きない）
  - 条件分岐は所属chainの終端として `break`。戻り値は `maxRow + 1`
- 工程番号（No）は走査順の連番、ルート属性は 本線 / Yes / No
- `canvasW = laneCount × laneWidth`、`canvasH = rowY(maxRow) + NH + 60`

### コネクタの描画ルール
- 親ノードの下辺中央 `(laneX(parent), top + NH)` から子ノードの上辺中央 `(laneX(child), top)` へ
- 通常（縦距離が `PITCH × 1.4` 以下）: 3次ベジェ
  `M fx fy C fx (fy+dy), tx (ty-dy), tx ty`（`dy = max(30, |ty-fy| × 0.45)`）
- 長距離（Noルートなど、縦距離が `PITCH × 1.4` 超）: **レーン境界のガター（カードが存在しない帯）を通る直角経路**。カードは各レーン中央に `cardW = laneWidth-40` 幅なので、レーン境界から±20pxは常に空き。
  `gutter = (max(fromLane, toLane) + 1) × laneWidth - 12`
  `M fx fy L fx (fy+26) L gutter (fy+26) L gutter (ty-26) L tx (ty-26) L tx ty`
  → これによりNoルートのコネクタがYesルートのカード下を横切らない
- 空ブランチのスタブへ向かう線は `stroke-dasharray:"5 4"`
- 色: 通常 `#cbd5e1`、Yes `#10b981`、No `#f43f5e`
- 終端に半径3.5の円（線と同色）
- **Yes/No ラベルは経路の中点ではなく条件ノード直下に固定**: `x = 条件ノード中心 ∓ 48px`（Yes=左/−48, No=右/+48）, `y = 条件ノード下辺 + 20px`

### レスポンシブ
- ヘッダーは `white-space:nowrap; overflow:hidden` で1行維持、中央タイトルのみ ellipsis で縮む（〜900px幅でも崩れないこと）
- 中央エリアは横スクロール。レーンヘッダーは縦スクロールに対して `sticky top:0`（横はコンテンツと一緒に動く）
- サイドバー・右パネルは固定幅（本プロトタイプはデスクトップ業務システム前提。モバイル対応は未定義）

---

## State Management

```ts
type NodeType = 'start' | 'task' | 'approval' | 'condition' | 'notify' | 'action' | 'end';

interface Rule { field: string; op: '≧' | '≦' | '=' | '≠' | '含む'; value: string }

interface FlowNode {
  id: string;                 // 'n1', 'n2', ... （表示にも使用）
  type: NodeType;
  name: string;               // 作業内容（何を）
  actor: string;              // 誰が（レーン決定）
  mode: '手動' | '自動';       // 実行区分
  sys: string;                // システム名＋機能名（自由入力）
  screenId: string;           // 画面 / API ID
  sysKind: '社内システム' | '外部連携' | 'システム外（手作業）';
  input: string;              // 入力データ
  output: string;             // 出力データ
  rule: string;               // 業務ルール・制約
  channel?: string;           // notify のみ（メール/Slack/Teams/社内通知）
  logic?: 'all' | 'any';      // condition のみ
  rules?: Rule[];             // condition のみ
  yes?: FlowNode[];           // condition のみ
  no?: FlowNode[];            // condition のみ
}

interface AppState {
  flow: FlowNode[];           // 本線 chain（条件分岐が入れ子でツリーを作る）
  selectedId: string | null;
  insert: { kind: 'branch'; id: string; branch: 'yes' | 'no' } | null;
  tab: 'flow' | 'table';
  seq: number;                // 新規ID採番カウンタ
}
```

- 派生値（毎レンダー計算、保持しない）: ノード座標・コネクタ・分岐ラベル・スタブ・手順表の行・工程数・アクター別工程数・ユースケース記述
- ツリー走査ヘルパ: 全chain列挙 / id検索（node, 所属chain, index を返す）/ 部分更新 `update(id, patch)` / ルール更新
- データ取得: なし（プロトタイプはダミーデータ内蔵）。実装時はフロー定義の GET / PUT、およびアクター・ルール項目・機能マスタの取得を想定
- 可変プロップ: `accent`（`#4f46e5`）, `compact`（false）, `laneWidth`（268）, `showUseCase`（true）

### ルール項目マスタ
`見積金額, 値引率, 商談ステージ, 取引区分, 与信結果, 納期` / 演算子 `≧, ≦, =, ≠, 含む`

---

## Design Tokens
> プロトタイプで確定したデザインコンセプト。これを最優先で使用する。

### Colors
| 用途 | 値 |
|---|---|
| アプリ背景 | `#f8fafc` |
| サーフェス（パネル・カード） | `#ffffff` |
| サーフェス（サブ/ゼブラ・入力枠内） | `#f8fafc` / `#f1f5f9` |
| 罫線（強） | `#cbd5e1` |
| 罫線（標準） | `#e2e8f0` |
| 罫線（弱・表内） | `#f1f5f9` |
| 本文 | `#0f172a` |
| 副文 | `#475569` / `#334155` |
| 補助・プレースホルダ | `#94a3b8` / `#64748b` |
| アクセント（プライマリ / 選択リング） | `#4f46e5`（hover `#4338ca`、選択リングは `#4f46e5` の15% alpha） |
| フォーカスリング | `#6366f1` |
| 選択行背景 / hover背景 | `#eef2ff` / `#f5f3ff` |
| Yes（成立） | 線 `#10b981` / 文字 `#047857` / 背景 `#ecfdf5` / 枠 `#a7f3d0` / 濃文字 `#065f46` |
| No（非成立） | 線 `#f43f5e` / 文字 `#be123c` / 背景 `#fff1f2` / 枠 `#fecdd3` / 濃文字 `#9f1239` |
| 条件ルールカード | 背景 `#fffbeb` / 枠 `#fde68a` / 内枠 `#fcd34d` / 文字 `#b45309` |
| ユースケース枠 | 背景 `#f5f3ff` / 枠 `#ddd6fe` / 見出し `#5b21b6`,`#6d28d9`,`#7c3aed` / 本文 `#3730a3` |
| ノード種別色 | 上記「ノード種別マスタ」の color / tint |
| アクター色 | 上記「アクターマスタ」の color |
| リンク | 既定 `#4f46e5` / hover `#4338ca`（下線） |

### Typography
- 本文フォント: `"Noto Sans JP", system-ui, sans-serif`（weight 400 / 500 / 700）
- 数値・ID: `"IBM Plex Mono", monospace`（weight 400 / 500）
- `-webkit-font-smoothing: antialiased`
- サイズスケール: 9.5 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15px
  - 15px/700: ヘッダーのプロダクト名・タブB見出し
  - 14px/700: 右パネルの選択ノード名
  - 13.5px/500: カードの作業内容
  - 13px: フォーム入力値・ヘッダー内タイトル
  - 12–12.5px: 表本文・パレットラベル・ボタン
  - 11–11.5px: 補助文・小ラベル
  - 9.5–10.5px: 種別ラベル・チップ・ID
- `letter-spacing`: `.02em`（プロダクト名）/ `.04em`（小見出し・ピル）/ `.06em`（種別ラベル・小見出し）/ `.08em`（グループ見出し）
- `line-height`: 1.3–1.6（本文系は 1.5–1.6）

### Spacing
4pxベース＋実測値: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20px。主要gap: フォーム 18px、カード内 7px、リスト 6px、グループ 16px

### Radius
`2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 999px(ピル)`

### Shadows
- カード（通常）: `0 1px 2px rgba(15,23,42,.06)`
- カード（選択）: `0 0 0 3px <accent>26, 0 8px 18px -8px rgba(15,23,42,.3)`
- タブ（選択）: `0 1px 2px rgba(15,23,42,.12)`
- レーンヘッダー: `0 1px 3px rgba(15,23,42,.06)`
- 分岐ラベルピル: `0 1px 2px rgba(15,23,42,.06)`

### Layout
- 左サイドバー 264px / 右パネル 352px / ヘッダー 56px（固定）
- レーン幅 268px（220–340）／カード幅 レーン幅−40 ／行ピッチ 152px（compact 118px）／キャンバス上端オフセット 28px

---

## Assets
外部画像・アイコンフォントは未使用。アイコンは全て 24×24 viewBox のインラインSVG（Lucide系のストロークアイコンを模した1パス構成、`stroke-width` 2〜2.2、linecap/linejoin round）。上記「ノード種別マスタ」および各画面節に `d` 属性を全て記載済み。フォントは Google Fonts（Noto Sans JP / IBM Plex Mono）。実装先に既存のアイコンライブラリがある場合は同等の意味のアイコン（play, check-square, shield-check, diamond, bell, zap, square, monitor, file-text, plus, x, list）に置換して良い。

## Files
| ファイル | 内容 |
|---|---|
| `workflow-requirements-builder.dc.html` | **本命のデザインリファレンス**。スイムレーン版（要件定義向け・アクター/機能/入出力/ユースケース記述あり）。ブラウザで直接開ける |
| `reference-v1-workflow-builder.dc.html` | 初期版。アクター概念のない汎用ワークフロービルダー（縦フロー＋左右分岐）。分岐の見せ方の比較用参考 |

いずれも単一ファイルで、上部にテンプレート（マークアップ）、下部に状態・レイアウト計算ロジック（`class Component`）が含まれる。レイアウトアルゴリズムと挿入・削除ロジックは本READMEの記述と同一なので、ロジック部分は移植の際の擬似コードとして参照可。
