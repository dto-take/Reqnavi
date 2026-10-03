import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";

// 規約62：PostgREST（Supabase API）は、複数行のSELECTを既定で1000行までしか返さず、超えた分を
// エラーも出さずに切り捨てる。件数に上限が無い取得は、必ずこのページング処理を通す。
//
// 使い方：build(from, to) で、同じ条件のクエリに .range(from, to) を付けたものを返す。
// 並び順は必ず一意になるようにすること（order("id") を最後のキーに含める）。並びが不安定だと、
// ページの境目で行の取りこぼし・重複が起きる（規約42）。
export const PAGE_SIZE = 1000;

type PageResult = PromiseLike<{ data: unknown[] | null; error: unknown }>;

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PageResult,
  pageSize: number = PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new UserFacingError(errorMessage(error));
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

// .in("col", keys) の keys が多いと、URLが長くなりすぎる。キーを分割し、各分割をページングして連結する。
export async function fetchAllPagesByKeys<T, K>(
  keys: K[],
  build: (chunk: K[]) => (from: number, to: number) => PageResult,
  chunkSize = 200
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < keys.length; i += chunkSize) {
    rows.push(...(await fetchAllPages<T>(build(keys.slice(i, i + chunkSize)))));
  }
  return rows;
}
