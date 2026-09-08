import { createServerActionClient } from "@/lib/supabase/server";
import { listWorkflowNodes } from "@/actions/workflow-builder";
import { buildProcedureTable } from "@/lib/workflow-narrative";

// U+FEFF (BOM)。エディタ上では見えないため、ここにコメントで明記しておく。
const BOM = "﻿";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createServerActionClient();

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();
  const nodes = await listWorkflowNodes(projectId);
  const rows = buildProcedureTable(nodes);

  const header = ["No.", "アクター", "作業内容", "区分", "システム", "画面ID", "入力", "出力", "業務ルール"];
  const csvLines = [
    header.join(","),
    ...rows.map((r) =>
      [r.stepNo, r.actor, r.action, r.mode, r.system, r.screenId, r.input, r.output, r.rule]
        .map((v) => `"${(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  // ExcelはBOM無しUTF-8のCSVを開くと日本語が文字化けするため、必ずBOMを付与する（規約：省略しない）
  const csvContent = BOM + csvLines.join("\r\n");

  const filename = `${project?.name ?? "project"}_業務手順表.csv`;
  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
