"use client";

// ネイティブ<input type="checkbox">は「一部選択（indeterminate）」をプロパティでしか
// 表現できずReactの宣言的な書き方と相性が悪いため、role="checkbox"のカスタム実装にする
// （ハンドオフの「チェックボックス仕様」節が要求するアクセシブルなカスタム実装にも合致する）。
export type CheckedState = boolean | "indeterminate";

export function Checkbox({
  checked,
  onChange,
  ariaLabel,
  className = "",
}: {
  checked: CheckedState;
  onChange: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : checked}
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={(e) => {
        // カード・グループ見出しなどクリック可能な親要素の中に置かれることが多いため、
        // チェックボックス自体のクリックが親（ドラッグ開始・折りたたみ切替等）に伝播しないようにする
        e.stopPropagation();
        onChange();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onChange();
        }
      }}
      className={`inline-flex items-center justify-center w-4 h-4 rounded flex-none cursor-pointer select-none ${className}`}
      style={{ border: "1.5px solid var(--text-faint)", background: "#fff" }}
    >
      {checked === "indeterminate" && (
        <span aria-hidden className="text-[11px] leading-none font-bold" style={{ color: "var(--brand)" }}>
          –
        </span>
      )}
      {checked === true && (
        <span aria-hidden className="text-[10px] leading-none font-bold" style={{ color: "var(--brand)" }}>
          ✓
        </span>
      )}
    </span>
  );
}
