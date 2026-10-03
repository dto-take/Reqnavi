"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ListedProjectRow } from "@/actions/projects";
import { ProjectCard } from "@/components/domain/project-list/ProjectCard";
import { ProjectRow, ProjectTableHeader } from "@/components/domain/project-list/ProjectRow";
import { Card } from "@/components/ui/card";
import { usePersistedValue } from "@/lib/use-persisted-value";
import { Input, Select } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";
import {
  countByState,
  filterBySearchAndCustomer,
  filterByStatus,
  sortProjects,
  type SortKey,
  type StatusFilter,
} from "@/lib/project-list/derive";

// 表示形式（カード／一覧）はlocalStorageに保存して次回も復元する。既定はカード。
// 保存は共通フック usePersistedValue（useSyncExternalStore。規約54）。ブラウザごとの保存なので、
// 別のブラウザ・シークレットウィンドウでは既定のカードに戻る。
type ViewMode = "card" | "list";
const VIEW_KEY = "reqnavi:project-list-view";

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "in_progress", label: "進行中" },
  { key: "not_started", label: "未着手" },
  { key: "completed", label: "完了" },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: "updated", label: "更新が新しい順" },
  { key: "progress", label: "進捗が高い順" },
  { key: "name", label: "案件名順" },
  { key: "customer", label: "顧客別" },
];

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1";

export function ProjectListScreen({
  projects,
  initialCustomerId,
}: {
  projects: ListedProjectRow[];
  initialCustomerId: string;
}) {
  const [viewRaw, setView] = usePersistedValue(VIEW_KEY, "card");
  const view: ViewMode = viewRaw === "list" ? "list" : "card";
  const [query, setQuery] = useState("");
  const customers = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) if (p.customerId) map.set(p.customerId, p.customerName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ja") || (a.id < b.id ? -1 : 1));
  }, [projects]);
  const [customerId, setCustomerId] = useState(customers.some((c) => c.id === initialCustomerId) ? initialCustomerId : "");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("updated");

  // 状態チップの件数は、検索・顧客で絞り込んだ後の件数
  const narrowed = useMemo(() => filterBySearchAndCustomer(projects, query, customerId), [projects, query, customerId]);
  const counts = useMemo(() => countByState(narrowed), [narrowed]);
  const shown = useMemo(() => sortProjects(filterByStatus(narrowed, status), sort), [narrowed, status, sort]) as ListedProjectRow[];

  function clearFilters() {
    setQuery("");
    setCustomerId("");
    setStatus("all");
  }

  if (projects.length === 0) {
    return (
      <Card className="text-center py-10">
        <p className="text-sm text-secondary mb-3">案件がありません</p>
        <Link href="/projects/new" className={buttonClasses("primary", "sm")}>
          最初の案件を作成
        </Link>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="案件名・顧客名で検索"
          placeholder="案件名・顧客名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-72"
        />
        <Select aria-label="顧客" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">顧客：すべて</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="並べ替え" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <div role="group" aria-label="表示形式" className="ml-auto flex gap-1 rounded-md border border-border p-0.5">
          {(["card", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`cursor-pointer rounded px-3 py-1 text-xs ${FOCUS} ${view === v ? "bg-hover font-medium text-primary" : "text-secondary hover:text-primary"}`}
            >
              {v === "card" ? "カード" : "一覧"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={status === c.key}
            data-status-chip={c.key}
            onClick={() => setStatus(c.key)}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs tabular-nums ${FOCUS} ${
              status === c.key ? "border-brand bg-brand text-white" : "border-border bg-page text-secondary hover:bg-hover"
            }`}
          >
            {c.label} {counts[c.key]}
          </button>
        ))}
        <span data-shown-count className="ml-auto text-xs tabular-nums text-faint">
          {shown.length} 件を表示
        </span>
      </div>

      {shown.length === 0 ? (
        <Card className="py-10 text-center" data-empty-filtered>
          <p className="mb-3 text-sm text-secondary">条件に合う案件がありません。</p>
          <button type="button" onClick={clearFilters} className={`${buttonClasses("secondary", "sm")} cursor-pointer ${FOCUS}`}>
            条件をクリア
          </button>
        </Card>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-page" role="table" aria-label="案件一覧">
          <ProjectTableHeader />
          <div role="rowgroup">
            {shown.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4 text-[11px] text-faint" data-legend>
        <span>章の進捗：</span>
        {[
          ["var(--brand)", "確定"],
          ["var(--status-review-text)", "作成中"],
          ["var(--border)", "未着手"],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-4 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        <span data-legend-progress-note>※進捗（15章）は確定の対象外です</span>
      </div>
    </div>
  );
}
