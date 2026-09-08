# 指示書：Phase1 Step9 ドキュメント出力（Word）

## 目的

案件で選択した章（`projects.selected_chapters`）を、貴社標準の15章構成でWord文書として出力する。テンプレートA/B/C（表形式）・D（階層ツリー）・E（チェックリスト）それぞれに応じた表現形式で出力する。詳細は `docs/01_requirements.md` §9（機能No.15）を参照。

## 前提確認

- Phase1 Step1〜8がすべて完了していること
- `docx`パッケージ（Node.js用Word生成ライブラリ）がインストールされていない場合、`npm install docx`を実行する

---

## Step 1: 出力用のRoute Handlerを作成

Server Actionではなく、バイナリファイルのダウンロードに適した**Route Handler**として実装する。新規ファイル `src/app/api/projects/[id]/export/route.ts`。

```ts
import { NextRequest } from "next/server";
import { createServerActionClient } from "@/lib/supabase/server";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, AlignmentType,
} from "docx";

const CHAPTER_NAMES: Record<number, string> = {
  1: "お客様概要", 2: "プロジェクトの目的", 3: "ロードマップ", 4: "KPI",
  5: "システム要件", 6: "開発スコープ", 7: "ビジネス要件", 8: "業務要件",
  9: "機能要件", 10: "非機能要件", 11: "データ移行要件", 12: "トレーニング要件",
  13: "システム運用要件", 14: "システム定着化支援要件", 15: "進捗",
};

const CHAPTER_TEMPLATE_MAP: Record<number, string> = {
  4: "D", 5: "A", 6: "C", 7: "A", 8: "C", 9: "C",
  10: "E", 11: "B", 12: "C", 13: "B", 14: "B",
};

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, size: 28 })],
  });
}

function p(text: string) {
  return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, size: 21 })] });
}

function cell(text: string, header = false) {
  return new TableCell({
    width: { size: 2000, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text: text ?? "", bold: header, size: 19 })] })],
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createServerActionClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name, selected_chapters, organizations(name)")
    .eq("id", projectId)
    .single();
  if (projectError || !project) {
    return new Response("案件が見つかりません", { status: 404 });
  }

  const sections: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
      children: [new TextRun({ text: project.name, bold: true, size: 40 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: (project.organizations as any)?.name ?? "", size: 24 })],
    }),
  ];

  const chapterNumbers = (project.selected_chapters as number[]).sort((a, b) => a - b);

  for (const chapterNo of chapterNumbers) {
    sections.push(h1(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}`));
    const templateType = CHAPTER_TEMPLATE_MAP[chapterNo];

    if (!templateType) {
      sections.push(p("（この章は自由記述章のため、本出力の対象外です。別途手入力してください）"));
      continue;
    }

    if (templateType === "D") {
      const { data: nodes } = await supabase
        .from("requirement_items")
        .select("id, parent_id, content")
        .eq("project_id", projectId)
        .eq("chapter_no", chapterNo);
      sections.push(...renderKpiTree(nodes ?? []));
      continue;
    }

    if (templateType === "E") {
      const { data: rows } = await supabase
        .from("requirement_items")
        .select("content")
        .eq("project_id", projectId)
        .eq("chapter_no", chapterNo);
      sections.push(...renderChecklist(rows ?? []));
      continue;
    }

    // A/B/C：表形式
    const { data: columns } = await supabase
      .from("chapter_column_templates")
      .select("column_key, label")
      .eq("template_type", templateType)
      .order("order_index");
    const { data: items } = await supabase
      .from("requirement_items")
      .select("content")
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo)
      .order("order_index");

    if (!items || items.length === 0) {
      sections.push(p("（この章にはまだ項目がありません）"));
      continue;
    }

    const table = new Table({
      rows: [
        new TableRow({ children: (columns ?? []).map((c) => cell(c.label, true)) }),
        ...items.map(
          (item) =>
            new TableRow({
              children: (columns ?? []).map((c) => cell(item.content[c.column_key] ?? "")),
            })
        ),
      ],
    });
    sections.push(table as unknown as Paragraph); // docxのSection.childrenはParagraph|Table双方を受け付ける
  }

  const doc = new Document({ sections: [{ children: sections }] });
  const buffer = await Packer.toBuffer(doc);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(project.name)}_要件定義書.docx"`,
    },
  });
}

function renderKpiTree(nodes: { id: string; parent_id: string | null; content: any }[]): Paragraph[] {
  const result: Paragraph[] = [];
  function walk(parentId: string | null, depth: number) {
    const children = nodes.filter((n) => n.parent_id === parentId);
    for (const node of children) {
      result.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "　".repeat(depth) + `[${node.content.level}] `, bold: true, size: 20 }),
            new TextRun({ text: node.content.text ?? "", size: 20 }),
          ],
        })
      );
      walk(node.id, depth + 1);
    }
  }
  walk(null, 0);
  return result.length > 0 ? result : [p("（この章にはまだ項目がありません）")];
}

function renderChecklist(rows: { content: any }[]): Paragraph[] {
  if (rows.length === 0) return [p("（この章にはまだ項目がありません）")];
  const result: Paragraph[] = [];
  for (const row of rows) {
    result.push(
      new Paragraph({
        spacing: { before: 150, after: 60 },
        children: [new TextRun({ text: row.content.category, bold: true, size: 22 })],
      })
    );
    result.push(p(row.content.overview ?? ""));
    for (const c of row.content.checklist ?? []) {
      result.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: `${c.item}　（${c.status}）`, size: 20 })],
        })
      );
    }
  }
  return result;
}
```

**注意（重要）**：`Document`の`sections[0].children`には、`Table`と`Paragraph`が混在した配列を渡す必要がある。上記コードの`sections.push(table as unknown as Paragraph)`は型を強引に合わせている暫定実装であり、`docx`パッケージの型定義上は`children`が`(Paragraph | Table)[]`を受け付けるはずである。実装時に型エラーが出た場合は、`sections`配列の型を`(Paragraph | Table)[]`に修正すること（本指示書のサンプルは概形提示であり、型定義の詳細は`docx`パッケージの実際のバージョンに従うこと）。

## Step 2: ダウンロードボタンを設置

案件詳細画面（`src/app/projects/[id]/members/page.tsx`のタブ群、または新規の案件トップページ）に以下を追加する。

```tsx
<a
  href={`/api/projects/${id}/export`}
  className="h-8 px-3 border border-border rounded-md text-sm flex items-center"
>
  Wordで出力
</a>
```

## Step 3: 動作確認

1. いくつかの章（例：5, 8, 9, 10, 4）にデータを入力した案件で、「Wordで出力」をクリック
2. `.docx`ファイルがダウンロードされることを確認
3. ダウンロードしたファイルを開き、以下を確認
   - タイトルページに案件名・顧客組織名が表示されている
   - 5章・8章・9章（テンプレートA/C）が表形式で出力されている
   - 4章（KPI）が階層インデント付きで出力されている
   - 10章（非機能要件）がカテゴリ見出し＋チェックリストの形式で出力されている
   - データが無い章は「まだ項目がありません」の一文のみになっている
4. `selected_chapters`に含まれない章が出力に含まれていないことを確認

## やってはいけないこと

- 出力対象を`selected_chapters`でフィルタせず、全15章を常に出力しない
- ステータスに関わらず全項目を出力する（Phase1では`ai_draft`のような未確定項目も含めて出力してよいが、将来Phase3で「確定版のみ出力」等の要件が追加される可能性がある点をコード中にコメントで残しておく）

## 完了条件

- [ ] `/api/projects/{id}/export` からWord文書がダウンロードできる
- [ ] テンプレートA/B/C（表）・D（ツリー）・E（チェックリスト）すべてが正しい形式で出力される
- [ ] `selected_chapters`によるフィルタが機能している
