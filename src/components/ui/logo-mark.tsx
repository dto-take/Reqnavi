// src/app/icon.svg（ブラウザタブ用ファビコン）と同じ意匠を、画面内（サイドバー・ログイン画面）に
// 埋め込み表示するためのReactコンポーネント版。Next.jsのicon.svg特殊ファイルは
// ファビコン生成専用の内部パスで配信されるため、画面内表示には別途このコンポーネントを使う。
// モチーフ：コンパスのリングと「R」の脚を融合させ、脚の部分が方位針（塗りのカイト形）になっている。
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <circle cx="16" cy="16" r="11" stroke="var(--bg-sidebar)" strokeWidth="1.8" fill="none" />
      <path
        d="M11 23 V9 H15 C17.5 9 17.5 14 15 14 H11"
        stroke="var(--bg-sidebar)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M11 14 L17 16.5 L23 23 L15.5 19 Z" fill="var(--bg-sidebar)" />
    </svg>
  );
}
