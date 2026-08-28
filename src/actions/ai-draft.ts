"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { CHAPTER_NAMES } from "@/lib/chapters";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";

const DraftItemSchema = z.object({
  content: z.record(z.string(), z.string().nullable()),
  confidence: z.enum(["explicit", "inferred"]),
  source_ref: z.string().nullable(),
  ambiguous: z.boolean(),
  ambiguous_text: z.string().nullable(),
});
const DraftResponseSchema = z.object({ items: z.array(DraftItemSchema) });

const DRAFT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "object", additionalProperties: { type: ["string", "null"] } },
          confidence: { type: "string", enum: ["explicit", "inferred"] },
          source_ref: { type: ["string", "null"] },
          ambiguous: { type: "boolean" },
          ambiguous_text: { type: ["string", "null"] },
        },
        required: ["content", "confidence", "source_ref", "ambiguous", "ambiguous_text"],
      },
    },
  },
  required: ["items"],
};

type SourceDocumentRow = {
  id: string;
  file_name: string;
  storage_path: string;
  classified_tags: string[];
};

type ColumnRow = { column_key: string; label: string; applicable_chapters: number[] | null };

type FeatureMappingRow = {
  requirement_pattern: string;
  standard_feature: string | null;
  requires_customization: boolean;
  notes: string | null;
};

async function generateDraftInternal(
  projectId: string,
  tenantId: string,
  chapterNo: number,
  templateType: "A" | "B" | "C"
) {
  const supabase = await createServerActionClient();
  const chapterName = CHAPTER_NAMES[chapterNo];
  if (!chapterName) throw new UserFacingError(`未対応の章です: ${chapterNo}`);

  // 1. 関連資料を取得（分類タグに章名が含まれるもののみ）
  // classified_tagsはjsonb列のため、.contains()に配列をそのまま渡すとpostgrest-jsが
  // Postgresのネイティブ配列リテラル（cs.{a,b}）として送ってしまい、jsonbのcs演算子が
  // 期待するJSON配列（cs.["a","b"]）にならず 22P02 で失敗する。文字列として渡すことで回避する。
  const { data: documentsData, error: docError } = await supabase
    .from("source_documents")
    .select("id, file_name, storage_path, classified_tags")
    .eq("project_id", projectId)
    .contains("classified_tags", JSON.stringify([chapterName]));
  if (docError) throw docError;
  const documents = documentsData as unknown as SourceDocumentRow[];
  if (!documents || documents.length === 0) {
    throw new UserFacingError(`「${chapterName}」に分類された資料がありません。先に資料をアップロード・分類してください。`);
  }

  // 2. 列定義を取得し、プロンプトに埋め込む説明文を作る
  const { data: columnsData, error: colError } = await supabase
    .from("chapter_column_templates")
    .select("column_key, label, applicable_chapters")
    .eq("template_type", templateType)
    .order("order_index");
  if (colError) throw colError;
  const columns = (columnsData as unknown as ColumnRow[]).filter(
    (c) => c.applicable_chapters === null || c.applicable_chapters.includes(chapterNo)
  );
  const columnsDescription = columns.map((c) => `${c.column_key}（${c.label}）`).join(", ");

  // 3. 資料抜粋を結合（テキスト系のみ。Step1同様の簡易実装）
  const excerpts = await Promise.all(
    documents.map(async (d) => {
      const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
      const text = file ? await file.text() : `[抽出不可: ${d.file_name}]`;
      return `--- ${d.file_name} ---\n${text.slice(0, 3000)}`;
    })
  );

  // 3.5 9章（機能要件）の場合のみ、Salesforce標準機能マッピングを参考情報として注入する
  let platformContext = "";
  if (chapterNo === 9) {
    const { data: projectData } = await supabase
      .from("projects")
      .select("platform_knowledge_set_id")
      .eq("id", projectId)
      .single();
    const project = projectData as unknown as { platform_knowledge_set_id: string | null } | null;

    if (project?.platform_knowledge_set_id) {
      const { data: mappingsData } = await supabase
        .from("platform_feature_mappings")
        .select("requirement_pattern, standard_feature, requires_customization, notes")
        .eq("knowledge_set_id", project.platform_knowledge_set_id);
      const mappings = (mappingsData as unknown as FeatureMappingRow[] | null) ?? [];

      platformContext = `\n\n【参考：Salesforce標準機能マッピング】\n` +
        mappings
          .map((m) => `- ${m.requirement_pattern} → ${m.standard_feature ?? "該当なし"}（${m.requires_customization ? "カスタム開発が必要" : "標準機能で対応可能"}）`)
          .join("\n");
    }
  }

  // 4. プロンプトを組み立ててGeminiを呼び出す
  const { id: promptId, body: promptBody } = await getActivePrompt("extract_requirements");
  const filledPrompt = promptBody
    .replace("{chapter_name}", chapterName)
    .replace("{columns_description}", columnsDescription)
    .replace("{document_excerpts}", excerpts.join("\n\n") + platformContext);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: filledPrompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: DRAFT_RESPONSE_SCHEMA,
      },
    })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = DraftResponseSchema.safeParse(JSON.parse(cleaned));

  // 5. ai_interactions に記録
  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: { chapter_no: chapterNo, document_count: documents.length },
    output: parsed.success ? parsed.data : { error: "validation_failed" },
  });

  if (!parsed.success) {
    throw new UserFacingError("AIの出力形式が不正でした。プロンプトまたはモデル出力を確認してください。");
  }

  // 6. requirement_items として保存（すべてai_draftステータス）
  for (const item of parsed.data.items) {
    const { data: inserted, error: insertError } = await supabase
      .from("requirement_items")
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        chapter_no: chapterNo,
        template_type: templateType,
        content: item.content,
        status: "ai_draft",
        ambiguous_flags: item.ambiguous
          ? [{ source: "extraction" as const, reason: item.ambiguous_text ?? undefined }]
          : [],
        confidence: item.confidence,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const insertedItem = inserted as unknown as { id: string };

    // 出典を全対象資料に対して紐付ける（MVPでは項目単位の精密な紐付けは行わない）
    const sourceRows = documents.map((d) => ({
      item_id: insertedItem.id,
      source_id: d.id,
      location_note: item.source_ref,
    }));
    await supabase.from("item_sources").insert(sourceRows);
  }

  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}

// Next.js 16では、Server Actionでthrowしたエラーはerror.tsx（グローバルエラー境界）に
// 到達する際にサーバー側のmessage/nameが失われ、常に汎用文言に置き換わる（開発時も同様、実機で確認済み）。
// このため意図的なエラー（資料未分類・AI出力不正等）はthrowせず、useActionState経由の
// 戻り値として返す（Next.js公式ドキュメントが推奨する「予期されるエラー」の扱い方）。
export async function generateDraft(
  projectId: string,
  tenantId: string,
  chapterNo: number,
  templateType: "A" | "B" | "C",
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    await generateDraftInternal(projectId, tenantId, chapterNo, templateType);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
