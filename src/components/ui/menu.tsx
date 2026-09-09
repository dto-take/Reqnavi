"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// 汎用の開閉可能なドロップダウンメニュー（他画面でも再利用できる形にしてよい、との
// 指示書の判断に基づき src/components/ui/ に配置）。外側クリック・Escapeで閉じる。
export function Menu({
  trigger,
  children,
  align = "end",
}: {
  trigger: (props: { onClick: () => void; open: boolean }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      {trigger({ onClick: () => setOpen((v) => !v), open })}
      {open && (
        // メニュー項目のクリックはバブリングでここに届く。個々のMenuItemに閉じる処理を
        // 持たせず、ここで一括して閉じることでMenuItem側の実装をシンプルに保つ。
        <div
          onClick={() => setOpen(false)}
          className={`absolute z-20 mt-1 min-w-40 rounded-md border border-border bg-page shadow-md py-1 ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  href,
  disabled,
  danger,
  children,
}: {
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const className = `block w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed ${
    danger ? "text-[#A23B2E]" : "text-secondary"
  }`;
  // hrefが渡された場合は<a>としてレンダリングする（<button>の中に<a>をネストするのは
  // HTML的に不正なため、リンク項目はbuttonではなくanchorそのものにする）。
  if (href) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  );
}
