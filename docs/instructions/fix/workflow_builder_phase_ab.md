# 指示書：業務フロービルダー フェーズA+B（データモデル拡張・条件分岐対応レイアウト・右パネル編集）

## 目的

添付のデザインハンドオフ（`design_handoff_workflow_builder/README.md`）に基づき、業務フロー機能を大幅に拡張する。

- **フェーズA**：条件分岐（Yes/No）に対応したデータモデルへの拡張、スイムレーンのレイアウトアルゴリズム、カード・コネクタ・空ブランチの描画
- **フェーズB**：右パネルでの詳細編集フォーム（ノード種別ごとの入力項目）、即時反映

**フェーズC（ユースケース記述の自動生成・業務手順表・CSV出力）・フェーズD（左サイドバーのノードパレット・挿入位置ルールの完全な優先順位・視覚的な仕上げ）は本指示書の対象外**とする。

## 重要な方針：デザイントークンはReqNavi既存のものを優先する

デザインハンドオフのREADMEは「記載のhexそのものを正とする」としているが、これはReqNavi全体の配色（深緑系、規約38〜41で確立済み）と矛盾する。以下の使い分けとする。

- **アクセントカラー（選択リング・プライマリボタン・フォーカスリング）**：ハンドオフの`#4f46e5`ではなく、ReqNaviの`--brand`（深緑）を使う
- **ノード種別ごとの色（開始=緑・手動タスク=藍・承認=紫・条件分岐=琥珀・自動通知=空色・自動処理=teal・終了=灰）**：これは装飾ではなく**情報の分類を担う配色**のため、ハンドオフに記載のhex値をそのまま使ってよい
- **Yes/No（成立/不成立）の色（緑/赤系）**：同様に情報を担うため、ハンドオフの値をそのまま使ってよい
- フォント（Noto Sans JP / IBM Plex Mono）は新規追加でよい（既存はInter一本化だが、IDやコード的な数値表示にはIBM Plex Monoの等幅フォントが適しているため、この機能に限り併用する）

## 前提確認

- ノードをクリックして編集するUXの提案（承認済み）を踏まえた実装であること
- デザインハンドオフの`workflow-requirements-builder.dc.html`を実際に開き、レイアウト・インタラクションの詳細を目視で確認してから着手すること

---

## Step 1: flow_nodesのスキーマ拡張

```bash
supabase migration new extend_flow_nodes_for_conditions
```

```sql
alter table flow_nodes
  add column if not exists node_type text not null default 'task'
    check (node_type in ('start', 'task', 'approval', 'condition', 'notify', 'action', 'end')),
  add column if not exists mode text default '手動' check (mode in ('手動', '自動')),
  add column if not exists screen_id text,
  add column if not exists sys_kind text check (sys_kind in ('社内システム', '外部連携', 'システム外（手作業）')),
  add column if not exists input_data text,
  add column if not exists output_data text,
  add column if not exists business_rule text,
  add column if not exists channel text,
  add column if not exists condition_logic text check (condition_logic in ('all', 'any')),
  add column if not exists condition_rules jsonb default '[]'::jsonb,
  add column if not exists branch text not null default 'main' check (branch in ('main', 'yes', 'no')),
  add column if not exists parent_condition_id uuid references flow_nodes(id) on delete cascade;
```

**注意**：既存の`label`列は「作業内容（何を）」、`role_lane`列は「アクター（誰が）」、`system_used`列は「利用システム・機能」に相当する。新規列を追加する形にし、これら既存列の意味・名前は変更しない。

`docs/02_architecture.md`のflow_nodes定義にこの拡張を追記すること。

## Step 2: レイアウトアルゴリズムを実装

新規ファイル `src/lib/workflow-layout.ts`（通常モジュール、DBに依存しない純粋関数）。

デザインハンドオフの「スイムレーン レイアウトアルゴリズム」節・「コネクタの描画ルール」節に記載の内容を、そのままTypeScriptに移植する。

```ts
export type WorkflowNode = {
  id: string;
  node_type: string;
  label: string;
  role_lane: string;
  branch: "main" | "yes" | "no";
  parent_condition_id: string | null;
  order_index: number;
};

export type LayoutResult = {
  laneOrder: string[];
  positions: Map<string, { row: number; lane: number }>;
  connectors: { from: string; to: string; kind: "normal" | "long" | "stub"; label?: string | null }[];
  stubs: { afterNodeId: string; branch: "yes" | "no" }[];
  canvasWidth: number;
  canvasHeight: number;
};

const LANE_WIDTH = 268;
const CARD_HEIGHT = 100;
const VERTICAL_GAP = 52;
const PITCH = CARD_HEIGHT + VERTICAL_GAP;

export function computeWorkflowLayout(nodes: WorkflowNode[]): LayoutResult {
  // 1. laneOrder: role_laneの値を初出順（order_index順）に収集する
  // 2. mainチェーン（branch='main' かつ parent_condition_id=null）を深さ優先で走査し、
  //    各ノードに行番号(row)を割り当てる
  // 3. condition型ノードに到達したら、そのnode.idをparent_condition_idに持つ
  //    branch='yes'のノード群をrow+1から、branch='no'のノード群をyesルート消費後の行から配置する
  //    Yes/Noいずれかが0件の場合は、その行にスタブ（stubs配列に追加）を置く
  // 4. コネクタ：親子関係にあるノード間の接続を、縦距離がPITCH×1.4以下なら"normal"、
  //    それを超える場合は"long"として connectors 配列に追加する
  // 5. canvasWidth = laneOrder.length × LANE_WIDTH、canvasHeight = 最大行番号 × PITCH + 適切な余白
}
```

**注意**：README記載のアルゴリズム（特に「条件分岐は所属chainの終端であることを保証する」という不変条件、Noルートの配置がYesルート消費後から始まる点）を正確に踏襲すること。誤ると、行の重なり・描画崩れが発生する。

## Step 3: スイムレーン描画コンポーネントを作成

新規ファイル `src/components/domain/workflow-builder/SwimlaneCanvas.tsx`。

- `computeWorkflowLayout`の結果をもとに、レーンヘッダー・レーン背景ストライプ・工程カード・コネクタ（SVG path）・分岐ラベルピル（Yes/No）・空ブランチのスタブを描画する
- 工程カードのスタイル・ノード種別ごとのアイコン・色は、デザインハンドオフの「ノード種別マスタ」表をそのまま移植する
- カードのクリックで選択状態にする（承認済みの「クリックして編集」UXに従う。ドラッグによる移動機能は本フェーズでは対象外とし、レイアウトアルゴリズムによる自動配置のみとする）
- 選択中のカードは、ハンドオフ記載の選択スタイル（`border-color:<accent>`。ただし`<accent>`はReqNaviの`--brand`を使う）にする

## Step 4: 右パネル編集フォームを作成

新規ファイル `src/components/domain/workflow-builder/NodeEditPanel.tsx`。

デザインハンドオフの「5. 右パネル」節に記載のフィールド構成をそのまま実装する。

- 未選択時：中央寄せの空状態
- 選択時：ヘッダ（種別ラベル・作業内容・工程番号）＋フォーム本体
  - 作業内容（text）
  - アクター（select、既存の`role_lane`値一覧から選択、または新規入力）／実行区分（select：手動/自動）
  - 利用システム・機能：グループ枠（システム名＋機能名、画面/API ID、システム区分）
  - 入力データ／出力データ（横並びtextarea）
  - `node_type === 'condition'`の場合のみ：AND/OR切替、ルールカード一覧（項目・演算子・値・削除ボタン）、「＋ ルールを追加」、Yes/Noルート要約カード
  - 業務ルール・制約（textarea）
- フッタ：「工程を削除」「選択解除」

**注意**：ハンドオフの「ルール項目マスタ」（見積金額・値引率等）はダミーデータであり、ReqNavi固有の項目ではない。**固定の選択肢ではなく自由入力（text）にする**。演算子（≧,≦,=,≠,含む）は選択肢のままでよい。

## Step 5: 編集の即時反映

`src/actions/business-flow.ts`に、ノードの各フィールドを更新するServer Actionを追加する。

```ts
export async function updateFlowNode(nodeId: string, projectId: string, patch: Record<string, unknown>) {
  const supabase = await createServerActionClient();
  const { error } = await supabase.from("flow_nodes").update(patch).eq("id", nodeId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/business-flow`);
}
```

`NodeEditPanel`の各フィールドの`onChange`で、`startTransition(() => updateFlowNode(...))`を呼ぶ。頻繁な入力で都度DB更新すると負荷が高いため、**入力欄からフォーカスが外れた時点（`onBlur`）で更新する**、またはデバウンス処理を検討すること（実装方法はお任せする）。

## Step 6: 動作確認

1. `supabase db reset`後、テスト用に条件分岐を含む業務フローデータを手動でDBに投入する（例：本線3ステップ→条件分岐→Yes側2ステップ・No側1ステップ→本線に合流）
2. スイムレーン図で、Yesルート・Noルートが正しい位置に描画され、Noルートのコネクタがガター経由で描画されることを確認する
3. 空ブランチで、スタブ（点線カード）が表示されることを確認する
4. カードをクリックすると右パネルに詳細編集フォームが表示され、フィールドを変更すると即座にカードの表示に反映されることを確認する
5. 条件分岐ノードを選択した場合のみ、ルールカード・AND/OR切替・Yes/Noルート要約が表示されることを確認する
6. 「工程を削除」で対象ノードが削除され、削除後は選択が解除されることを確認する（条件分岐ノード削除時のYesルート展開等、完全な追加・削除ルールはフェーズDで対応する。本フェーズでは単純な削除のみでよい）

## やってはいけないこと

- ハンドオフのHTML・インラインスタイルをそのままコピーしない（既存のコンポーネント体系・Tailwindクラスにマッピングする）
- ノード種別色・Yes/No色以外の箇所に、ハンドオフのインディゴ（`#4f46e5`）を使わない。ReqNaviの`--brand`を使う
- 本フェーズでノードパレット・完全な挿入位置ルール・ユースケース記述・業務手順表・CSV出力を実装しない（フェーズC・Dの対象）

## 完了条件

- [ ] `flow_nodes`のスキーマ拡張済み（`docs/02_architecture.md`への追記含む）
- [ ] レイアウトアルゴリズム実装済み
- [ ] スイムレーン描画（カード・コネクタ・分岐ラベル・スタブ）実装済み
- [ ] 右パネル編集フォーム実装済み（ノード種別に応じた出し分け含む）
- [ ] 編集の即時反映が動作確認済み
- [ ] テストデータでの条件分岐レイアウトが正しく描画されることを確認済み
