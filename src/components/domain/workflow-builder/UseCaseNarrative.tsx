"use client";

import { buildUseCaseText } from "@/lib/workflow-narrative";
import type { WorkflowNodeRow } from "@/actions/workflow-builder";
import { useToast } from "@/components/ui/toast";

export function UseCaseNarrative({ nodes }: { nodes: WorkflowNodeRow[] }) {
  const text = buildUseCaseText(nodes);
  const { show } = useToast();

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-primary">ユースケース記述</h3>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            show("コピーしました");
          }}
          className="text-xs text-secondary underline"
        >
          コピー
        </button>
      </div>
      <pre className="text-sm text-primary whitespace-pre-wrap font-sans">{text}</pre>
    </div>
  );
}
