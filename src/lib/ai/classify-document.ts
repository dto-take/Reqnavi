import { GoogleGenAI, type PartUnion } from "@google/genai";
import { z } from "zod";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { extractContent } from "@/lib/ai/extract-content";

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
export async function classifyDocument(file: Blob, fileName: string) {
  const extracted = await extractContent(file, fileName);
  const { body: promptBody } = await getActivePrompt("classify_document");

  let contents: PartUnion[];
  if (extracted.kind === "text") {
    contents = [promptBody.replace("{document_excerpt}", extracted.content.slice(0, 4000))];
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

  const parsed = ClassificationSchema.safeParse(JSON.parse(response.text ?? "{}"));
  if (!parsed.success) {
    return { tags: [], summary: "" };
  }
  return parsed.data;
}
