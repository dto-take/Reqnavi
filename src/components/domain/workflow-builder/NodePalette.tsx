"use client";

import { NODE_META, PALETTE_GROUPS } from "@/lib/workflow-builder-shared";

// デザインハンドオフはドラッグ&ドロップにも対応しているが、ドラッグ中のプレビュー・
// ドロップ先ハイライト等の実装コストがこのアプリの利用シーン（PM/SEが少数の工程を
// 組み立てる程度）に見合わないと判断し、クリック挿入のみを実装する
// （docs/instructions/workflow_builder_phase_d.md Step2の「クリック挿入のみでも良い」の判断）。
export function NodePalette({
  insertHint,
  disabled,
  onInsert,
}: {
  insertHint: string;
  disabled: boolean;
  onInsert: (nodeType: string) => void;
}) {
  return (
    <div className="w-66 flex-none border border-border rounded-lg bg-page flex flex-col overflow-hidden">
      <div className="p-4 pb-2.5 border-b border-border">
        <div className="text-xs font-bold tracking-wide text-primary">工程を追加</div>
        <div className="text-[11px] text-faint mt-1 leading-relaxed">{insertHint}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4">
        {PALETTE_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-1.5">
            <div className="text-[10px] font-bold text-faint tracking-widest px-1">{g.label}</div>
            {g.types.map((type) => {
              const meta = NODE_META[type];
              return (
                <button
                  key={type}
                  type="button"
                  data-palette-type={type}
                  disabled={disabled}
                  onClick={() => onInsert(type)}
                  className="flex items-center gap-2.5 w-full text-left p-2.5 rounded-lg border border-border bg-white hover:border-(--brand) hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <span className="w-7.5 h-7.5 flex-none rounded-lg flex items-center justify-center" style={{ background: meta.tint }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={meta.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d={meta.icon} />
                    </svg>
                  </span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-medium text-primary">{meta.label}</span>
                    <span className="text-[11px] text-faint leading-tight">{meta.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
