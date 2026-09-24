import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, Ref } from "react";

type FieldVariant = "default" | "bare";

// outline-noneでブラウザ標準のフォーカスリングを消しているため、キーボード操作時に
// フォーカス位置が見えなくならないよう、focus-visibleで代替のリングを必ず表示する
// （progress_ux_phase4.md Step3）。
const FIELD_BASE =
  "text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1";

// bare: 枠線を持たないテーブルセル内編集欄向け（RequirementTable等）。
// 通常のInput/Textareaと共通のdisabled表現・transitionだけを引き継ぐ
const VARIANT_CLASSES: Record<FieldVariant, string> = {
  default: "border border-border rounded-md bg-page focus:border-primary disabled:bg-hover",
  bare: "focus:bg-hover disabled:bg-hover",
};

export function Input({
  variant = "default",
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { variant?: FieldVariant }) {
  const sizing = variant === "bare" ? "px-3 py-2" : "h-9 px-2";
  return <input className={`${sizing} ${FIELD_BASE} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}

export function Textarea({
  variant = "default",
  className = "",
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { variant?: FieldVariant; ref?: Ref<HTMLTextAreaElement> }) {
  const sizing = variant === "bare" ? "px-3 py-2" : "px-2 py-1.5";
  return <textarea ref={ref} className={`${sizing} ${FIELD_BASE} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`h-9 px-2 ${FIELD_BASE} ${VARIANT_CLASSES.default} ${className}`} {...props} />;
}
