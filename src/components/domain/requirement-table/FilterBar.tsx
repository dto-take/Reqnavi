"use client";

import { Menu, MenuItem } from "@/components/ui/menu";
import type { FilterType, GroupByAxis } from "@/lib/requirement-grouping";

const FILTER_LABELS: Record<FilterType, string> = {
  all: "すべて",
  todo: "要対応",
  ambiguous: "曖昧表現",
  confirmed: "確定",
};

const FILTER_ORDER: FilterType[] = ["all", "todo", "ambiguous", "confirmed"];

const GROUP_BY_LABELS: Record<GroupByAxis, string> = {
  category: "要件区分",
  status: "ステータス",
  none: "なし",
};

const GROUP_BY_ORDER: GroupByAxis[] = ["category", "status", "none"];

export function FilterBar({
  filter,
  onFilterChange,
  counts,
  groupBy,
  onGroupByChange,
}: {
  filter: FilterType;
  onFilterChange: (f: FilterType) => void;
  counts: Record<FilterType, number>;
  groupBy: GroupByAxis;
  onGroupByChange: (g: GroupByAxis) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap px-1">
      {FILTER_ORDER.map((f) => {
        const active = filter === f;
        return (
          <button
            key={f}
            type="button"
            data-filter-chip={f}
            onClick={() => onFilterChange(f)}
            className="text-xs font-medium rounded-full px-3.5 py-1.5 whitespace-nowrap cursor-pointer border transition-colors"
            style={
              active
                ? { background: "var(--text-primary)", color: "#fff", borderColor: "var(--text-primary)" }
                : { background: "#fff", color: "var(--text-primary)", borderColor: "var(--border)" }
            }
          >
            {FILTER_LABELS[f]} <span className="font-mono">{counts[f]}</span>
          </button>
        );
      })}

      <Menu
        trigger={({ onClick }) => (
          <button
            type="button"
            data-groupby-trigger
            onClick={onClick}
            className="text-xs font-medium rounded-md px-3 py-1.5 border border-border bg-page hover:bg-hover cursor-pointer whitespace-nowrap ml-auto"
          >
            グループ：{GROUP_BY_LABELS[groupBy]} ▾
          </button>
        )}
      >
        {GROUP_BY_ORDER.map((axis) => (
          <div key={axis} data-groupby-option={axis}>
            <MenuItem onClick={() => onGroupByChange(axis)}>{GROUP_BY_LABELS[axis]}</MenuItem>
          </div>
        ))}
      </Menu>

      <span className="text-[11px] text-faint whitespace-nowrap">絞り込んでもグループの区切りは残ります</span>
    </div>
  );
}
