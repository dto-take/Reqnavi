import type { SupabaseClient } from "@supabase/supabase-js";

// AI生成で「新しい行の保存に成功してから、置き換え前の行を削除する」ための、idによる削除（規約70）。
// onlyEqを指定すると、その列がその値のままの行だけを削除する
// （置き換え前の行が、その間に人の操作で状態が変わっていたら、消さない）。
// 削除はRLSで拒否されてもエラーにならず0件になる（規約47）。削除のあとに、対象が残っていないことを確かめる。
// 失敗したときはエラーを返す（呼び出し側で、元のエラーを優先するか、利用者へ知らせるかを決める）。
// chunkSizeごとに分けて削除する。親子の外部キー（on delete cascadeなし）がある表は、
// 1回の文で消す必要があるため、全件を1回にする（Infinity）。
export async function deleteRowsByIds(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  onlyEq: { column: string; value: string } | null,
  chunkSize = 100
): Promise<unknown> {
  const size = Number.isFinite(chunkSize) ? chunkSize : Math.max(ids.length, 1);
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    const { error } = await (onlyEq
      ? supabase.from(table).delete().in("id", chunk).eq(onlyEq.column, onlyEq.value).select("id")
      : supabase.from(table).delete().in("id", chunk).select("id"));
    if (error) {
      console.error(`[deleteRowsByIds] ${table}の削除に失敗:`, error.message);
      return error;
    }
    const remaining = supabase.from(table).select("id", { count: "exact", head: true }).in("id", chunk);
    const { count, error: countError } = await (onlyEq ? remaining.eq(onlyEq.column, onlyEq.value) : remaining);
    if (countError || (count ?? 0) > 0) {
      console.error(`[deleteRowsByIds] ${table}の削除が反映されませんでした:`, countError?.message ?? `${count}件が残っています`);
      return countError ?? new Error("削除が反映されませんでした");
    }
  }
  return null;
}
