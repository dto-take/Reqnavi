import { createServerActionClient } from "@/lib/supabase/server";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, AlignmentType,
} from "docx";
import { CHAPTER_NAMES, CHAPTER_TEMPLATE_MAP as FLAT_CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";

// src/lib/chapters.tsのCHAPTER_TEMPLATE_MAPはテンプレートA/B/C（フラット行構造）のみを
// 対象としており、D（KPI・4章）・E（非機能要件・10章）は含まない（この2つは専用の
// ツリー構造・チェックリスト構造のため、フラットな表として扱えない）。Word出力ではこの2章も
// 別ロジックで出力するため、共通マップにD/Eを合成したローカル版を使う。
const CHAPTER_TEMPLATE_MAP: Record<number, string> = {
  ...FLAT_CHAPTER_TEMPLATE_MAP,
  4: "D",
  10: "E",
};


type ProjectExportRow = {
  name: string;
  selected_chapters: number[];
  organizations: { name: string } | null;
};

type ColumnRow = { column_key: string; label: string; applicable_chapters: number[] | null };
type ItemRow = { content: Record<string, string | null> };
type KpiNodeRow = { id: string; parent_id: string | null; content: { level: string; text: string } };
type ChecklistRow = {
  content: {
    category: string;
    overview: string | null;
    checklist: { item: string; status: string }[];
  };
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createServerActionClient();

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("name, selected_chapters, organizations(name)")
    .eq("id", projectId)
    .single();
  if (projectError || !projectData) {
    return new Response("案件が見つかりません", { status: 404 });
  }
  const project = projectData as unknown as ProjectExportRow;

  const sections: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
      children: [new TextRun({ text: project.name, bold: true, size: 40 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: project.organizations?.name ?? "", size: 24 })],
    }),
  ];

  const chapterNumbers = [...project.selected_chapters].sort((a, b) => a - b);

  for (const chapterNo of chapterNumbers) {
    sections.push(h1(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}`));
    const templateType = CHAPTER_TEMPLATE_MAP[chapterNo];

    if (!templateType) {
      sections.push(p("（この章は自由記述章のため、本出力の対象外です。別途手入力してください）"));
      continue;
    }

    if (templateType === "D") {
      const { data: nodesData } = await supabase
        .from("requirement_items")
        .select("id, parent_id, content")
        .eq("project_id", projectId)
        .eq("chapter_no", chapterNo);
      const nodes = (nodesData as unknown as KpiNodeRow[] | null) ?? [];
      sections.push(...renderKpiTree(nodes));
      continue;
    }

    if (templateType === "E") {
      const { data: rowsData } = await supabase
        .from("requirement_items")
        .select("content")
        .eq("project_id", projectId)
        .eq("chapter_no", chapterNo);
      const rows = (rowsData as unknown as ChecklistRow[] | null) ?? [];
      sections.push(...renderChecklist(rows));
      continue;
    }

    // A/B/C：表形式
    // Phase1では確定判定に関わらず（ai_draft等の未確定項目も含めて）全項目を出力する。
    // Phase3で「確定版のみ出力」等の要件が入る場合は、ここでstatus絞り込みを追加する。
    const { data: columnsData } = await supabase
      .from("chapter_column_templates")
      .select("column_key, label, applicable_chapters")
      .eq("template_type", templateType)
      .order("order_index");
    const columns = ((columnsData as unknown as ColumnRow[] | null) ?? []).filter(
      (c) => c.applicable_chapters === null || c.applicable_chapters.includes(chapterNo)
    );

    const { data: itemsData } = await supabase
      .from("requirement_items")
      .select("content")
      .eq("project_id", projectId)
      .eq("chapter_no", chapterNo)
      .order("order_index");
    const items = (itemsData as unknown as ItemRow[] | null) ?? [];

    if (items.length === 0) {
      sections.push(p("（この章にはまだ項目がありません）"));
      continue;
    }

    const table = new Table({
      rows: [
        new TableRow({ children: columns.map((c) => cell(c.label, true)) }),
        ...items.map(
          (item) =>
            new TableRow({
              children: columns.map((c) => cell(item.content[c.column_key] ?? "")),
            })
        ),
      ],
    });
    sections.push(table);
  }

  const doc = new Document({ sections: [{ children: sections }] });
  const buffer = await Packer.toBuffer(doc);

  // Node BufferとFetch APIのBodyInitがこの環境では型上噛み合わないため、Uint8Arrayに変換する
  // Content-DispositionはHTTPヘッダのためByteString（Latin-1）必須。日本語ファイル名を
  // そのまま埋め込むと「文字コードが255を超える」エラーになるため、RFC 5987のfilename*で
  // percent-encodeしたUTF-8ファイル名を渡す（ASCIIフォールバックのfilenameも併記する）。
  const filename = `${project.name}_要件定義書.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="export.docx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

function renderKpiTree(nodes: KpiNodeRow[]): Paragraph[] {
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

function renderChecklist(rows: ChecklistRow[]): Paragraph[] {
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
