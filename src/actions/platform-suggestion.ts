"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { errorMessage } from "@/lib/error-message";

type FeatureMappingRow = {
  requirement_pattern: string;
  standard_feature: string | null;
  requires_customization: boolean;
};

// onClick+startTransitionから直接呼ばれるため（<form>を介さない）、useActionStateは使えない。
// 呼び出し元（RequirementTable.tsx）がPromiseの解決値を直接受け取れるため、こちらは
// エラーをthrowせず戻り値で返すだけでよい（Server Action由来のthrowはerror.tsxで
// メッセージが失われるため。ai-draft.ts参照）。
export async function suggestPlatformFeature(
  itemId: string,
  projectId: string,
  chapterNo: number
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();

    const { data: itemData, error: itemError } = await supabase
      .from("requirement_items")
      .select("content")
      .eq("id", itemId)
      .single();
    if (itemError) throw itemError;
    const item = itemData as unknown as { content: Record<string, string | null> };

    const { data: projectData } = await supabase
      .from("projects")
      .select("platform_knowledge_set_id")
      .eq("id", projectId)
      .single();
    const project = projectData as unknown as { platform_knowledge_set_id: string | null } | null;
    if (!project?.platform_knowledge_set_id) return { error: null };

    const { data: mappingsData, error: mapError } = await supabase
      .from("platform_feature_mappings")
      .select("requirement_pattern, standard_feature, requires_customization")
      .eq("knowledge_set_id", project.platform_knowledge_set_id);
    if (mapError) throw mapError;
    const mappings = mappingsData as unknown as FeatureMappingRow[];

    const targetText = `${item.content.name ?? ""} ${item.content.detail ?? ""}`;

    // 1. まず単純な部分一致で当てはめを試みる（AI呼び出し不要のため低コスト）
    const directMatch = mappings.find((m) => targetText.includes(m.requirement_pattern));
    let resultText: string;

    if (directMatch) {
      resultText = directMatch.requires_customization
        ? `${directMatch.standard_feature ?? "該当なし"}（カスタム開発要）`
        : (directMatch.standard_feature ?? "該当なし");
    } else {
      // 2. 一致が無ければAIに最も近いものを判断させる
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const mappingList = mappings
        .map((m) => `${m.requirement_pattern} → ${m.standard_feature ?? "該当なし"}`)
        .join("\n");
      const response = await callGeminiSafely(() =>
        ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `以下の機能要件に最も近いSalesforce標準機能を1つ選ぶか、無ければ「該当なし（カスタム開発要）」と回答してください。回答は機能名のみ、説明文は不要です。\n\n【機能要件】${targetText}\n\n【マッピング一覧】\n${mappingList}`,
        })
      );
      resultText = (response.text ?? "該当なし（カスタム開発要）").trim();
    }

    const nextContent = { ...item.content, platform_feature: resultText };
    const { error: updateError } = await supabase
      .from("requirement_items")
      .update({ content: nextContent })
      .eq("id", itemId);
    if (updateError) throw updateError;

    revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
