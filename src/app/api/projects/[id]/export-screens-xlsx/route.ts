import { createServerActionClient } from "@/lib/supabase/server";

type ItemRow = { content: Record<string, string> };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createServerActionClient();

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();
  const { data: itemsData } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", 9)
    .order("order_index");
  const items = (itemsData as unknown as ItemRow[] | null) ?? [];

  const screenItems = items.filter((i) => (i.content.screen_fields ?? "").trim() !== "");

  const XLSX = await import("xlsx");
  const rows = screenItems.map((i) => ({
    画面名: i.content.name ?? "",
    画面パターン: i.content.screen_pattern ?? "",
    表示項目: i.content.screen_fields ?? "",
    操作: i.content.screen_actions ?? "",
    項目定義: i.content.field_definitions ?? "",
    外部IF定義: i.content.external_if ?? "",
    対応機能: i.content.platform_feature ?? "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 20 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "画面設計書");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = `${project?.name ?? "project"}_画面設計書.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
