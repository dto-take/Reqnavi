import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export type ButtonSize = "sm" | "md";
type Variant = ButtonVariant;
type Size = ButtonSize;

const BASE = "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT_CLASSES: Record<Variant, string> = {
  // brandはtext-primary（本文文字色）とは独立したボタン専用トークン（globals.css参照）。
  // 以前はtext-primaryをボタン背景に流用していたため、文字色を変えるとボタン色も連動してしまっていた。
  primary: "bg-brand text-white hover:opacity-90",
  secondary: "border border-border text-primary hover:bg-hover",
  ghost: "text-secondary underline hover:text-primary disabled:no-underline",
  danger: "text-(--status-needhearing-text) underline hover:opacity-70 disabled:no-underline",
  // exception_approved（例外承認）ステータスと同じ紫色。StatusBadgeの配色に合わせる
  accent: "text-[#6E5A9E] underline hover:opacity-70 disabled:no-underline",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
};

// ghost/danger/accentは既存コードでの実態（テキストリンク的な小さいインラインボタン）に合わせ、
// 高さ・角丸を持たせず、テキストサイズのみvariant側で指定する
const GHOST_LIKE_SIZE_CLASSES: Record<Size, string> = {
  sm: "text-xs",
  md: "text-sm",
};

const GHOST_LIKE_VARIANTS: Variant[] = ["ghost", "danger", "accent"];

// Linkをボタン風に見せる箇所（例：案件一覧の「+ 新規案件」）向けに、見た目のクラス文字列だけを
// 公開する。<button>を<a>の中にネストするのはHTML的に不正なため、その場合はLink側にこれを渡す。
export function buttonClasses(variant: Variant = "secondary", size: Size = "sm", className = "") {
  const isGhostLike = GHOST_LIKE_VARIANTS.includes(variant);
  const sizeClasses = isGhostLike ? GHOST_LIKE_SIZE_CLASSES[size] : SIZE_CLASSES[size];
  return `${BASE} ${sizeClasses} ${VARIANT_CLASSES[variant]} ${className}`;
}

export function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
