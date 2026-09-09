// カードの「本文」として表示する列を選ぶ純粋関数。DBに依存しない。
// フェーズ1の「先頭列（order_index最小）＝本文」という単純化が、テンプレートCの
// 「区分・分類」（グループ見出しと重複する短い分類名）を本文にしてしまい、実際に読みたい
// 「内容」等の長文が項目サマリの小さな表示に埋もれる不具合を起こしていたための是正。
// RequirementCard（カード表示）とgetRecentKnowledge（案件トップのナレッジ一覧）の
// 両方から参照し、本文選定ロジックを一本化する（やってはいけないこと：別々に持たせない）。
const BODY_FIELD_PRIORITY = ["detail", "issue", "why", "name"];

export function pickBodyColumnKey(availableKeys: string[]): string | null {
  for (const key of BODY_FIELD_PRIORITY) {
    if (availableKeys.includes(key)) return key;
  }
  // 優先リストに無いテンプレートの場合、categoryは短い分類名でしかなく本文には
  // 不適切なため除外した上で、それ以外の先頭列にフォールバックする。
  return availableKeys.find((k) => k !== "category") ?? null;
}
