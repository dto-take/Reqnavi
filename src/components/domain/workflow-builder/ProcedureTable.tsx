"use client";

import { buildProcedureTable } from "@/lib/workflow-narrative";
import { DownloadButton } from "@/components/ui/download-button";
import type { WorkflowNodeRow } from "@/actions/workflow-builder";

export function ProcedureTable({ projectId, nodes }: { projectId: string; nodes: WorkflowNodeRow[] }) {
  const rows = buildProcedureTable(nodes);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <DownloadButton href={`/api/projects/${projectId}/export-procedure-csv`} fallbackFileName="procedure.csv" pendingText="CSV生成中...">
          CSVでダウンロード
        </DownloadButton>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center text-sm text-secondary border border-border rounded-lg bg-page py-12">
          まだ工程がありません
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-sidebar text-left">
                <th className="px-2 py-2">No.</th>
                <th className="px-2 py-2">アクター</th>
                <th className="px-2 py-2">作業内容</th>
                <th className="px-2 py-2">区分</th>
                <th className="px-2 py-2">システム</th>
                <th className="px-2 py-2">入力</th>
                <th className="px-2 py-2">出力</th>
                <th className="px-2 py-2">業務ルール</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.stepNo}-${i}`} className="border-t border-hover">
                  <td className="px-2 py-2 font-mono">{r.stepNo}</td>
                  <td className="px-2 py-2">{r.actor}</td>
                  <td className="px-2 py-2">
                    {r.action}
                    {r.branchContext && <div className="text-faint">（{r.branchContext}）</div>}
                  </td>
                  <td className="px-2 py-2">{r.mode}</td>
                  <td className="px-2 py-2">{r.system}</td>
                  <td className="px-2 py-2">{r.input}</td>
                  <td className="px-2 py-2">{r.output}</td>
                  <td className="px-2 py-2">{r.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
