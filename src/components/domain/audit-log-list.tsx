"use client";

import { useEffect, useRef, useState } from "react";
import { listAuditLogs, type AuditLogPage, type AuditLogRow } from "@/actions/audit-logs";
import { runAction } from "@/lib/run-action";
import { useToast } from "@/components/ui/toast";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ACTION_LABELS: Record<string, string> = {
  "document.delete": "資料の削除",
  "member.remove": "メンバーの削除",
  "project.delete": "案件の削除",
  "baseline.confirm": "ベースラインの確定",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  document: "資料",
  member: "メンバー",
  project: "案件",
  baseline: "ベースライン",
};

// details（メタデータのみ）を、操作ごとに読みやすい文にする
function describeDetails(action: string, d: Record<string, unknown>): string {
  const num = (v: unknown) => (typeof v === "number" ? `${v.toLocaleString("ja-JP")}件` : "不明");
  switch (action) {
    case "document.delete": {
      const size = typeof d.file_size === "number" ? `${Math.max(1, Math.round(d.file_size / 1024)).toLocaleString("ja-JP")}KB` : "不明";
      return `サイズ ${size}／出典とする項目 ${num(d.cited_item_count)}`;
    }
    case "member.remove":
      return d.self_removal === true ? "自分自身を外した" : "他のメンバーを外した";
    case "project.delete":
      return `資料 ${num(d.document_count)}／項目 ${num(d.item_count)}`;
    case "baseline.confirm":
      return `版 ${typeof d.version === "string" ? d.version : "不明"}／項目 ${num(d.item_count)}`;
    default:
      return "";
  }
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function AuditLogList({ initial }: { initial: AuditLogPage }) {
  const { show } = useToast();
  const [rows, setRows] = useState<AuditLogRow[]>(initial.rows);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [action, setAction] = useState("");
  const [project, setProject] = useState("");
  const [loading, setLoading] = useState(false);
  // 絞り込みの変更が続いたとき、古い問い合わせの結果で上書きしない
  const seq = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const mine = ++seq.current;
    // 案件名の入力は、打ち終わりを少し待ってから問い合わせる（操作の種類の変更は、そのまま即時）
    const timer = setTimeout(async () => {
      setLoading(true);
      const r = await runAction(() => listAuditLogs({ action: action || null, project }, 0), show);
      if (mine === seq.current) {
        if (r) {
          setRows(r.data.rows);
          setHasMore(r.data.hasMore);
        }
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [action, project, show]);

  async function loadMore() {
    const mine = seq.current;
    setLoading(true);
    const r = await runAction(() => listAuditLogs({ action: action || null, project }, rows.length), show);
    if (mine === seq.current && r) {
      setRows((prev) => [...prev, ...r.data.rows]);
      setHasMore(r.data.hasMore);
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Select aria-label="操作の種類" value={action} onChange={(e) => setAction(e.target.value)} data-audit-filter-action>
          <option value="">すべての操作</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Input
          aria-label="案件名で絞り込み"
          placeholder="案件名で絞り込み"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="w-56"
          data-audit-filter-project
        />
      </div>

      <div className="grid grid-cols-[10rem_8rem_9rem_1fr_1fr_1fr] gap-x-3 text-xs text-faint pb-1 border-b border-border">
        <span>日時</span>
        <span>操作</span>
        <span>実行者</span>
        <span>案件（顧客）</span>
        <span>対象</span>
        <span>詳細</span>
      </div>
      <div className="flex flex-col" aria-busy={loading}>
        {rows.length === 0 && <p className="text-sm text-faint py-4" data-audit-empty>該当する記録はありません</p>}
        {rows.map((r) => (
          <div key={r.id} data-audit-row className="grid grid-cols-[10rem_8rem_9rem_1fr_1fr_1fr] gap-x-3 py-2 border-b border-hover text-sm items-start">
            <span className="text-xs text-secondary">{formatTime(r.occurred_at)}</span>
            <span className="text-primary">{ACTION_LABELS[r.action] ?? r.action}</span>
            <span className="text-xs text-secondary break-words">
              {r.actor_name ?? "（不明）"}
              {r.actor_role && <span className="text-faint">（{r.actor_role}）</span>}
            </span>
            <span className="text-xs text-secondary break-words">
              {r.project_name ?? "（不明）"}
              {r.customer_name && <span className="text-faint">（{r.customer_name}）</span>}
            </span>
            <span className="text-xs text-secondary break-words">
              {r.target_type && <span className="text-faint">{TARGET_TYPE_LABELS[r.target_type] ?? r.target_type}：</span>}
              {r.target_label ?? "-"}
            </span>
            <span className="text-xs text-secondary break-words">{describeDetails(r.action, r.details)}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading} data-audit-more>
            {loading ? "読み込み中..." : "もっと見る"}
          </Button>
        </div>
      )}
    </div>
  );
}
