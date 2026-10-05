import { cache } from "react";
import { createServerActionClient } from "@/lib/supabase/server";
import { hiddenChaptersFor } from "@/lib/permissions";

// 現在のユーザーのロールにとって非公開の章（RLSで項目が読めない章）。集計・表示から除くために使う。
export const getHiddenChapterNos = cache(async (): Promise<number[]> => {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  return hiddenChaptersFor(claims?.claims?.user_role as string | undefined);
});
