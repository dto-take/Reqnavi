import { GoogleGenAI, type PartUnion } from "@google/genai";
import { z } from "zod";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { parseAiJson } from "@/lib/ai/parse-ai-json";
import { extractContent } from "@/lib/ai/extract-content";
import { DOCUMENT_EXCERPT_MAX_LENGTH } from "@/lib/ai/excerpt-limit";
import type { createServerActionClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerActionClient>>;

// PDFのテキスト抽出結果がこの文字数未満なら、日本語フォント埋め込み等で文字を取り出せていないとみなし、
// PDF本体をGeminiへ渡して分類する（素案生成のPDF原本添付と同じ考え方）。
const PDF_TEXT_MIN_LENGTH = 50;
// 素案生成（ai-draft.ts）のPDF添付と同じ上限。超えるPDFは添付せず、テキストでの分類にフォールバックする。
const MAX_PDF_ATTACHMENT_BYTES = 15 * 1024 * 1024;

// ai_interactionsへ分類の実行を記録するための文脈（案件に属さない呼び出しでは渡さない）
export type ClassifyRecordContext = { supabase: Supabase; projectId: string };

const ClassificationSchema = z.object({
  tags: z.array(z.string()),
  summary: z.string(),
});

const CLASSIFICATION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    tags: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["tags", "summary"],
};

// fileNameを別引数で受け取る理由はextractContent側のコメント参照
// （アップロード時のFile／再分類時のBlobの両方から同じ関数を呼べるようにするため）。
export async function classifyDocument(file: Blob, fileName: string, record?: ClassifyRecordContext) {
  const extracted = await extractContent(file, fileName);
  const { id: promptId, body: promptBody } = await getActivePrompt("classify_document");

  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  const textLength = extracted.kind === "text" ? extracted.content.trim().length : 0;
  // 文字の少ないPDFだけ、PDF本体を添付する。添付できない（上限超過・読み込み失敗）ときは従来のテキスト分類
  let pdfBase64: string | null = null;
  if (isPdf && textLength < PDF_TEXT_MIN_LENGTH && file.size <= MAX_PDF_ATTACHMENT_BYTES) {
    try {
      pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    } catch (e) {
      console.error("[classifyDocument] PDF本体の読み込みに失敗したため、テキストで分類します:", e instanceof Error ? e.message : e);
    }
  }

  let contents: PartUnion[];
  if (pdfBase64) {
    const excerpt = extracted.kind === "text" ? extracted.content.slice(0, DOCUMENT_EXCERPT_MAX_LENGTH) : "";
    contents = [
      promptBody.replace("{document_excerpt}", `${excerpt}
（テキストを取り出せなかった、または少なかったため、PDF本体を直接参照してください）`),
      { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
    ];
  } else if (extracted.kind === "text") {
    contents = [promptBody.replace("{document_excerpt}", extracted.content.slice(0, DOCUMENT_EXCERPT_MAX_LENGTH))];
  } else if (extracted.kind === "image") {
    contents = [
      promptBody.replace("{document_excerpt}", "（画像を直接参照してください）"),
      { inlineData: { mimeType: extracted.mimeType, data: extracted.base64 } },
    ];
  } else {
    contents = [promptBody.replace("{document_excerpt}", `[ファイル名からの推測: ${fileName}]`)];
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: CLASSIFICATION_RESPONSE_SCHEMA,
      },
    })
  );

  const parsed = ClassificationSchema.safeParse(parseAiJson(response.text));
  // 画像・テキスト以外の形式（PDF・Office等）で、文字を取り出せず、PDF本体も渡せなかった場合
  const isTextFormat = /.(txt|md)$/i.test(fileName);
  const textUnavailable = !pdfBase64 && extracted.kind !== "image" && !isTextFormat && textLength === 0;
  const result = { ...(parsed.success ? parsed.data : { tags: [], summary: "" }), textUnavailable };

  // 分類の実行を記録する（記録の失敗で、分類・登録を失敗させない）
  if (record) {
    const { error } = await record.supabase.from("ai_interactions").insert({
      project_id: record.projectId,
      prompt_id: promptId,
      input_summary: { file_name: fileName, pdf_attached: pdfBase64 !== null, text_length: textLength },
      output: parsed.success ? parsed.data : { error: "validation_failed" },
    });
    if (error) console.error("[classifyDocument] ai_interactionsの記録に失敗:", error.message);
  }
  return result;
}
