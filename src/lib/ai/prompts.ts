import { createServerActionClient } from "@/lib/supabase/server";

export async function getActivePrompt(purpose: string): Promise<{ id: string; body: string }> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("prompts")
    .select("id, prompt_body")
    .eq("purpose", purpose)
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error(`アクティブなプロンプトが見つかりません: ${purpose}`);
  const row = data as unknown as { id: string; prompt_body: string };
  return { id: row.id, body: row.prompt_body };
}
