import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";

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

export async function classifyDocument(excerpt: string) {
  const { body: promptBody } = await getActivePrompt("classify_document");
  const filledPrompt = promptBody.replace("{document_excerpt}", excerpt.slice(0, 4000));

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: filledPrompt,
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
