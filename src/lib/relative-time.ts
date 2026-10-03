// 「3分前」形式の相対時刻。レンダリング時点の時刻（Date.now()）に依存するため、表示側で
// suppressHydrationWarningを付けること（規約53）。
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}
