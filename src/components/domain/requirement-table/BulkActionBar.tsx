"use client";

import { useState } from "react";
import { Menu, MenuItem } from "@/components/ui/menu";

// ハンドオフ「C. 一括操作バー」節はダークサーフェス（背景#1b1a17）のstickyバーだが、
// ReqNaviの既存デザイントークンにはダークサーフェス用の色が定義されていない
// （globals.cssのtext-primaryは本文文字色）。README「既存プロダクトのデザインシステムが
// 優先。トークンが既にあるならそちらにマップする」との指示に従い、背景色にはtext-primaryを
// 転用しつつ、白系のボーダー・文字色はこのコンポーネント固有のリテラル値として持つ
// （既存のButtonコンポーネントの各variantは白背景前提のため流用しない）。
export function BulkActionBar({
  count,
  categories,
  pending,
  onConfirm,
  onSetCategory,
  onReject,
  onClear,
}: {
  count: number;
  categories: string[];
  pending: boolean;
  onConfirm: () => void;
  onSetCategory: (category: string) => void;
  onReject: () => void;
  onClear: () => void;
}) {
  const [newCategory, setNewCategory] = useState("");

  if (count === 0) return null;

  function handleAddNewCategory() {
    const value = newCategory.trim();
    if (!value) return;
    onSetCategory(value);
    setNewCategory("");
  }

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3.5 flex-wrap rounded-lg px-5 py-3 mb-4 shadow-md animate-rise"
      style={{ background: "var(--text-primary)", color: "#f6f3ec" }}
    >
      <span className="text-sm font-medium whitespace-nowrap">
        <span className="font-mono">{count}</span> 件を選択中
      </span>
      <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="text-xs font-medium rounded-md px-3.5 py-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ background: "var(--status-confirmed-text)", color: "#fff" }}
        >
          一括で確定
        </button>

        <Menu
          trigger={({ onClick }) => (
            <button
              type="button"
              disabled={pending}
              onClick={onClick}
              className="text-xs font-medium rounded-md px-3 py-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: "transparent", color: "#f6f3ec", border: "1px solid rgba(246,243,236,.42)" }}
            >
              グループを変更 ▾
            </button>
          )}
        >
          {categories.map((c) => (
            <MenuItem key={c} onClick={() => onSetCategory(c)}>
              {c}
            </MenuItem>
          ))}
          <div className="border-t border-border my-1" />
          <div className="flex items-center gap-1 px-2 py-1.5">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddNewCategory();
                }
              }}
              placeholder="新しい区分名"
              className="min-w-0 flex-1 text-xs px-2 py-1 rounded border border-border outline-none"
            />
            <button
              type="button"
              disabled={!newCategory.trim()}
              onClick={handleAddNewCategory}
              className="text-xs text-brand font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer px-1"
            >
              追加
            </button>
          </div>
        </Menu>

        <button
          type="button"
          disabled={pending}
          onClick={onReject}
          className="text-xs font-medium rounded-md px-3 py-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ background: "transparent", color: "#f6f3ec", border: "1px solid rgba(246,243,236,.42)" }}
        >
          不採用にする
        </button>

        <button
          type="button"
          onClick={onClear}
          className="text-xs px-1.5 py-2 whitespace-nowrap cursor-pointer"
          style={{ color: "#b8b1a1" }}
        >
          選択解除
        </button>
      </div>
    </div>
  );
}
