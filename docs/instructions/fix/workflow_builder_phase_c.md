# 指示書：業務フロービルダー フェーズC（ユースケース記述の自動生成・業務手順表・CSV出力）

## 目的

1. ノード・エッジの構造化データから、ユースケース記述（自然文）を自動生成する
2. 同じデータを表形式（業務手順表）で表示する
3. 業務手順表をCSVでダウンロードできるようにする
4. フロー図・業務手順表・ユースケース記述をタブで切り替えられるようにする

## 重要な設計判断：AI呼び出しは使わない

ユースケース記述・業務手順表は、**既に構造化済みのデータ（ノード・エッジ）からの機械的な変換**であり、非構造データからの抽出（Flow1等）とは性質が異なる。決定的なロジック（純粋関数）で生成する（Gemini呼び出しは行わない）。

## 前提確認

- 業務フロービルダー フェーズA+B・最小限のノード追加機能が完了していること

---

## Step 1: ユースケース記述・業務手順表の生成ロジックを作成

新規ファイル `src/lib/workflow-narrative.ts`（通常モジュール、DBに依存しない純粋関数）。

```ts
import type { WorkflowNode } from "@/lib/workflow-layout";

export type ProcedureRow = {
  stepNo: string;
  actor: string;
  action: string;
  mode: string;
  system: string;
  screenId: string;
  input: string;
  output: string;
  rule: string;
  branchContext: string | null;
};

export function buildProcedureTable(nodes: WorkflowNode[]): ProcedureRow[] {
  // mainチェーンを深さ優先で走査し、条件分岐に到達したらYESブランチ→NOブランチの順で
  // 「親の番号-枝番」形式（例："2-1"）を割り当てながら再帰的に処理する。
  // 各ノードをProcedureRowに変換する（node_type='condition'の場合、
  // condition_logic・condition_rulesを日本語の条件文に変換してbranchContextへの
  // 引き継ぎに使う。例：[{field:"見積金額", op:">=", value:"100万円"}] → "見積金額 ≧ 100万円"）
}

export function buildUseCaseText(nodes: WorkflowNode[]): string {
  // buildProcedureTableの結果を、番号付きの自然文に変換する。
  // 例：
  // 1. 営業担当者が「見積作成」を行う（Salesforce）
  // 2. 営業マネージャーが「見積承認」を行う（Salesforce）
  //    条件：見積金額 ≧ 100万円 の場合
  //    【YESの場合】
  //    2-1. 経理担当者が「与信チェック」を行う
  //    【NOの場合】
  //    2-1. 営業担当者が「受注登録」を行う
  // 3. （本線に合流）...
}
```

**注意**：番号の枝分かれ表現・条件文の日本語変換ルールは、デザインハンドオフに同様の記載があれば参照し、無ければ上記の例に準じた自然な形式で実装してよい（具体的な文言表現はお任せする）。

## Step 2: フロー図・業務手順表・ユースケース記述のタブ切り替えを追加

`src/components/domain/workflow-builder/WorkflowBuilderClient.tsx`にタブ切り替えUIを追加する。

```tsx
const [view, setView] = useState<"canvas" | "table" | "narrative">("canvas");

<div className="flex gap-1 mb-3">
  {(["canvas", "table", "narrative"] as const).map((v) => (
    <button
      key={v}
      onClick={() => setView(v)}
      className={`text-xs px-3 py-1.5 rounded-md ${view === v ? "bg-brand text-white" : "text-secondary hover:bg-hover"}`}
    >
      {v === "canvas" ? "フロー図" : v === "table" ? "業務手順表" : "ユースケース記述"}
    </button>
  ))}
</div>

{view === "canvas" && /* 既存のSwimlaneCanvas + NodeEditPanel */}
{view === "table" && <ProcedureTable nodes={nodes} />}
{view === "narrative" && <UseCaseNarrative nodes={nodes} />}
```

新規ファイル `src/components/domain/workflow-builder/ProcedureTable.tsx`。

```tsx
"use client";

import { buildProcedureTable } from "@/lib/workflow-narrative";
import type { WorkflowNode } from "@/lib/workflow-layout";

export function ProcedureTable({ nodes }: { nodes: WorkflowNode[] }) {
  const rows = buildProcedureTable(nodes);

  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-sidebar text-left">
            <th className="px-2 py-2">No.</th>
            <th className="px-2 py-2">アクター</th>
            <th className="px-2 py-2">作業内容</th>
            <th className="px-2 py-2">区分</th>
            <th className="px-2 py-2">システム</th>
            <th className="px-2 py-2">入力</th>
            <th className="px-2 py-2">出力</th>
            <th className="px-2 py-2">業務ルール</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stepNo} className="border-t border-hover">
              <td className="px-2 py-2">{r.stepNo}</td>
              <td className="px-2 py-2">{r.actor}</td>
              <td className="px-2 py-2">{r.action}{r.branchContext && <div className="text-faint">（{r.branchContext}）</div>}</td>
              <td className="px-2 py-2">{r.mode}</td>
              <td className="px-2 py-2">{r.system}</td>
              <td className="px-2 py-2">{r.input}</td>
              <td className="px-2 py-2">{r.output}</td>
              <td className="px-2 py-2">{r.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

新規ファイル `src/components/domain/workflow-builder/UseCaseNarrative.tsx`。

```tsx
"use client";

import { buildUseCaseText } from "@/lib/workflow-narrative";
import type { WorkflowNode } from "@/lib/workflow-layout";
import { useToast } from "@/components/ui/toast";

export function UseCaseNarrative({ nodes }: { nodes: WorkflowNode[] }) {
  const text = buildUseCaseText(nodes);
  const { show } = useToast();

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-primary">ユースケース記述</h3>
        <button
          onClick={() => { navigator.clipboard.writeText(text); show("コピーしました"); }}
          className="text-xs text-secondary underline"
        >
          コピー
        </button>
      </div>
      <pre className="text-sm text-primary whitespace-pre-wrap font-sans">{text}</pre>
    </div>
  );
}
```

## Step 3: CSV出力を作成

新規ファイル `src/app/api/projects/[id]/export-procedure-csv/route.ts`。

```ts
import { NextRequest } from "next/server";
import { createServerActionClient } from "@/lib/supabase/server";
import { buildProcedureTable } from "@/lib/workflow-narrative";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createServerActionClient();

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();
  const { data: nodes } = await supabase
    .from("flow_nodes")
    .select("*")
    .eq("project_id", projectId)
    .eq("flow_type", "business_builder");

  const rows = buildProcedureTable((nodes ?? []) as never);

  const header = ["No.", "アクター", "作業内容", "区分", "システム", "画面ID", "入力", "出力", "業務ルール"];
  const csvLines = [
    header.join(","),
    ...rows.map((r) =>
      [r.stepNo, r.actor, r.action, r.mode, r.system, r.screenId, r.input, r.output, r.rule]
        .map((v) => `"${(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  const csvContent = "\uFEFF" + csvLines.join("\r\n");

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent((project?.name ?? "project"))}_業務手順表.csv`,
    },
  });
}
```

**注意**：CSVにExcel向けのBOM（`\uFEFF`）を付与しないと、日本語がExcelで文字化けする。この点を省略しないこと。

「業務手順表」タブに、`DownloadButton`（既存の共通コンポーネント）でこのCSVへのリンクを追加する。

```tsx
<DownloadButton href={`/api/projects/${id}/export-procedure-csv`} fallbackFileName="procedure.csv" pendingText="CSV生成中...">
  CSVでダウンロード
</DownloadButton>
```

## Step 4: 動作確認

1. フェーズA+Bで作成した条件分岐込みのテストデータで、「業務手順表」タブに切り替え、全ノードが正しい番号（"2-1"等の分岐番号込み）で表形式に表示されることを確認する
2. 「ユースケース記述」タブで、番号付きの自然文が生成され、YES/NOの分岐が文中で分かりやすく表現されていることを確認する
3. 「コピー」ボタンでクリップボードにコピーされることを確認する
4. CSVをダウンロードし、Excelで開いて文字化けしないこと、列・行の内容が業務手順表と一致することを確認する
5. フロー図・業務手順表・ユースケース記述のタブ切り替えがスムーズに機能することを確認する

## やってはいけないこと

- ユースケース記述・業務手順表の生成にGemini（AI）呼び出しを使わない
- CSV出力でBOMの付与を省略しない

## 完了条件

- [ ] `buildProcedureTable`・`buildUseCaseText`実装済み
- [ ] タブ切り替えUI実装済み
- [ ] 業務手順表・ユースケース記述の表示実装済み
- [ ] CSV出力実装済み（BOM付与含む）
- [ ] 動作確認済み
