import PptxGenJS from "pptxgenjs";
import { createServerActionClient } from "@/lib/supabase/server";
import { getProjectOverview } from "@/actions/project-overview";
import { CHAPTER_NAMES, CHAPTER_TEMPLATE_MAP as FLAT_CHAPTER_TEMPLATE_MAP } from "@/lib/chapters";

// Word出力（export/route.ts）と同じ理由：src/lib/chapters.tsのCHAPTER_TEMPLATE_MAPは
// テンプレートA/B/C（フラット行構造）のみが対象で、D（KPI・4章）・E（非機能要件・10章）を
// 含まない。この2章も別ロジックで出力するため、ローカル版に合成する。
const CHAPTER_TEMPLATE_MAP: Record<number, string> = {
  ...FLAT_CHAPTER_TEMPLATE_MAP,
  4: "D",
  10: "E",
};

const NAVY = "1F4D3D";
const GRAY = "6B6960";
const HEADER_FILL = "F1EFE8";
const BORDER_COLOR = "E5E1D8";
const TEXT_COLOR = "2B2A27";

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

  const pres = new PptxGenJS();
  // デフォルトのLAYOUT_16x9（10in x 5.625in）だと、以降のスライドで使う座標
  // （表の右端12.9in・下端6.6in等）がスライド外にはみ出す。LAYOUT_WIDE（13.33in x 7.5in）に
  // 変更して収める。
  pres.layout = "LAYOUT_WIDE";

  addTitleSlide(pres, project.name, project.organizations?.name ?? "");
  await addOverviewSlide(pres, projectId);

  const chapterNumbers = [...project.selected_chapters].sort((a, b) => a - b);

  for (const chapterNo of chapterNumbers) {
    const templateType = CHAPTER_TEMPLATE_MAP[chapterNo];

    if (!templateType) {
      const slide = pres.addSlide();
      addChapterTitle(slide, chapterNo);
      slide.addText("（この章は自由記述章のため、本出力の対象外です。別途手入力してください）", {
        x: 0.7, y: 1.5, w: 11.5, h: 1, fontSize: 12, color: GRAY,
      });
      continue;
    }

    if (templateType === "D") {
      await addKpiSlide(pres, projectId, chapterNo);
      continue;
    }
    if (templateType === "E") {
      await addChecklistSlides(pres, projectId, chapterNo);
      continue;
    }

    await addTableSlides(pres, projectId, chapterNo, templateType);
  }

  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;

  // Uint8Array変換・RFC5987ファイル名の理由はWord出力と同じ（規約26・27）。
  const filename = `${project.name}_要件定義書.pptx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="export.pptx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

function addChapterTitle(slide: PptxGenJS.Slide, chapterNo: number, suffix = "") {
  slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}${suffix}`, {
    x: 0.5, y: 0.4, w: 12.3, h: 0.8, fontSize: 22, bold: true, color: NAVY,
  });
}

function addTitleSlide(pres: PptxGenJS, projectName: string, organizationName: string) {
  const slide = pres.addSlide();
  slide.addText(projectName, {
    x: 0.5, y: 2.8, w: 12.3, h: 1, align: "center", fontSize: 36, bold: true, color: NAVY,
  });
  slide.addText(organizationName, {
    x: 0.5, y: 3.9, w: 12.3, h: 0.6, align: "center", fontSize: 18, color: GRAY,
  });
  slide.addText("要件定義書", {
    x: 0.5, y: 4.6, w: 12.3, h: 0.5, align: "center", fontSize: 14, color: GRAY,
  });
}

async function addOverviewSlide(pres: PptxGenJS, projectId: string) {
  const overview = await getProjectOverview(projectId);
  const slide = pres.addSlide();
  slide.addText("案件概要", { x: 0.5, y: 0.4, w: 12.3, h: 0.8, fontSize: 22, bold: true, color: NAVY });

  const stats: [string, string][] = [
    ["平均充足率", `${overview.avgReadiness}%`],
    ["資料件数", `${overview.documentCount}件`],
    ["メンバー", `${overview.memberCount}名`],
    ["ベースライン", overview.baseline?.version_no ?? "未確定"],
  ];

  const cardWidth = 2.9;
  const gap = 0.3;
  stats.forEach(([label, value], i) => {
    const x = 0.5 + i * (cardWidth + gap);
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: 1.6, w: cardWidth, h: 1.6, fill: { color: HEADER_FILL }, line: { color: BORDER_COLOR, width: 0.5 }, rectRadius: 0.06,
    });
    slide.addText(value, { x, y: 1.8, w: cardWidth, h: 0.7, align: "center", fontSize: 26, bold: true, color: NAVY });
    slide.addText(label, { x, y: 2.5, w: cardWidth, h: 0.5, align: "center", fontSize: 12, color: GRAY });
  });
}

async function addTableSlides(pres: PptxGenJS, projectId: string, chapterNo: number, templateType: string) {
  const supabase = await createServerActionClient();
  const { data: columnsData } = await supabase
    .from("chapter_column_templates")
    .select("column_key, label, applicable_chapters")
    .eq("template_type", templateType)
    .order("order_index");
  // applicable_chaptersでの絞り込みが必要（規約：TD-004。listColumnDefs・Word出力と同じ扱いを
  // しないと、他章専用の列（例：11章のみのB列how/how_much）が全章で表示されてしまう）。
  const cols = ((columnsData as unknown as ColumnRow[] | null) ?? []).filter(
    (c) => c.applicable_chapters === null || c.applicable_chapters.includes(chapterNo)
  );

  const { data: itemsData } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .order("order_index");
  const rows = (itemsData as unknown as ItemRow[] | null) ?? [];
  const ROWS_PER_SLIDE = 6;

  if (rows.length === 0) {
    const slide = pres.addSlide();
    addChapterTitle(slide, chapterNo);
    slide.addText("（この章にはまだ項目がありません）", { x: 0.7, y: 1.5, w: 11.5, h: 1, fontSize: 12, color: GRAY });
    return;
  }

  for (let i = 0; i < rows.length; i += ROWS_PER_SLIDE) {
    const pageRows = rows.slice(i, i + ROWS_PER_SLIDE);
    const slide = pres.addSlide();
    const pageLabel = rows.length > ROWS_PER_SLIDE ? `（${Math.floor(i / ROWS_PER_SLIDE) + 1}/${Math.ceil(rows.length / ROWS_PER_SLIDE)}）` : "";
    addChapterTitle(slide, chapterNo, pageLabel);

    const tableData: PptxGenJS.TableRow[] = [
      cols.map((c) => ({ text: c.label, options: { bold: true, fill: { color: HEADER_FILL }, color: TEXT_COLOR, fontSize: 10 } })),
      ...pageRows.map((row) =>
        cols.map((c) => ({ text: row.content[c.column_key] ?? "", options: { fontSize: 9, color: TEXT_COLOR } }))
      ),
    ];
    slide.addTable(tableData, {
      x: 0.4, y: 1.3, w: 12.5, h: 5.6,
      border: { type: "solid", color: BORDER_COLOR, pt: 0.5 },
      autoPage: false,
      valign: "top",
    });
  }
}

async function addKpiSlide(pres: PptxGenJS, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: nodesData } = await supabase
    .from("requirement_items")
    .select("id, parent_id, content")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  const nodes = (nodesData as unknown as KpiNodeRow[] | null) ?? [];

  const slide = pres.addSlide();
  addChapterTitle(slide, chapterNo);

  if (nodes.length === 0) {
    slide.addText("（この章にはまだ項目がありません）", { x: 0.7, y: 1.5, w: 11.5, h: 1, fontSize: 12, color: GRAY });
    return;
  }

  const lines: string[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const node of nodes.filter((n) => n.parent_id === parentId)) {
      lines.push(`${"　".repeat(depth)}[${node.content.level}] ${node.content.text}`);
      walk(node.id, depth + 1);
    }
  }
  walk(null, 0);

  slide.addText(lines.join("\n"), {
    x: 0.7, y: 1.4, w: 11.9, h: 5.7, fontSize: 13, color: TEXT_COLOR, breakLine: true, valign: "top",
  });
}

async function addChecklistSlides(pres: PptxGenJS, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: rowsData } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);
  const rows = (rowsData as unknown as ChecklistRow[] | null) ?? [];

  if (rows.length === 0) {
    const slide = pres.addSlide();
    addChapterTitle(slide, chapterNo);
    slide.addText("（この章にはまだ項目がありません）", { x: 0.7, y: 1.5, w: 11.5, h: 1, fontSize: 12, color: GRAY });
    return;
  }

  for (const row of rows) {
    const content = row.content;
    const slide = pres.addSlide();
    slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]} － ${content.category}`, {
      x: 0.5, y: 0.4, w: 12.3, h: 0.8, fontSize: 20, bold: true, color: NAVY,
    });
    slide.addText(content.overview ?? "", { x: 0.7, y: 1.3, w: 11.9, h: 1, fontSize: 12, color: GRAY });
    const checklistLines = (content.checklist ?? []).map((c) => `${c.item}　（${c.status}）`).join("\n");
    slide.addText(checklistLines, {
      x: 0.7, y: 2.4, w: 11.9, h: 4.6, fontSize: 13, color: TEXT_COLOR, breakLine: true, valign: "top",
    });
  }
}
