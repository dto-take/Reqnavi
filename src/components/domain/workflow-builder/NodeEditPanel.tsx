"use client";

import { useMemo, useTransition } from "react";
import { computeWorkflowLayout } from "@/lib/workflow-layout";
import { toWorkflowNode, branchSummary, NODE_META, RULE_OPS } from "@/lib/workflow-builder-shared";
import { updateFlowNode, deleteWorkflowNode, type WorkflowNodeRow, type ConditionRule } from "@/actions/workflow-builder";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function NodeEditPanel({
  node,
  allNodes,
  projectId,
  actorOptions,
  onLocalChange,
  onDeleted,
  onDeselect,
}: {
  node: WorkflowNodeRow | null;
  allNodes: WorkflowNodeRow[];
  projectId: string;
  actorOptions: string[];
  onLocalChange: (nodeId: string, patch: Partial<WorkflowNodeRow>) => void;
  onDeleted: () => void;
  onDeselect: () => void;
}) {
  const [, startTransition] = useTransition();
  const { show } = useToast();

  const stepNumber = useMemo(() => {
    if (!node) return null;
    const layout = computeWorkflowLayout(allNodes.map(toWorkflowNode));
    return layout.stepNumbers.get(node.id) ?? null;
  }, [node, allNodes]);

  if (!node) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-8 text-center">
        <div className="w-11 h-11 rounded-xl bg-hover flex items-center justify-center">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16M4 12h10M4 19h7" />
          </svg>
        </div>
        <div className="text-[13px] font-medium text-secondary">工程が未選択です</div>
        <div className="text-[11.5px] text-faint leading-relaxed">
          レーン上のカードをクリックすると
          <br />
          詳細を編集できます。
        </div>
      </div>
    );
  }

  const meta = NODE_META[node.node_type] ?? NODE_META.task;
  const isCondition = node.node_type === "condition";

  function persist(patch: Record<string, unknown>) {
    startTransition(() => {
      updateFlowNode(node!.id, projectId, patch).then((res) => {
        if (res.error) show(res.error, "error");
      });
    });
  }

  function setLocal(patch: Partial<WorkflowNodeRow>) {
    onLocalChange(node!.id, patch);
  }

  function textFieldProps(key: "label" | "role_lane" | "system_used" | "screen_id" | "input_data" | "output_data" | "business_rule") {
    return {
      value: node![key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLocal({ [key]: e.target.value } as Partial<WorkflowNodeRow>),
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => persist({ [key]: e.target.value }),
    };
  }

  function selectFieldProps(key: "mode" | "sys_kind" | "condition_logic") {
    return {
      value: node![key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        setLocal({ [key]: e.target.value } as Partial<WorkflowNodeRow>);
        persist({ [key]: e.target.value });
      },
    };
  }

  function updateRules(rules: ConditionRule[], persistNow: boolean) {
    setLocal({ condition_rules: rules });
    if (persistNow) persist({ condition_rules: rules });
  }

  function handleDelete() {
    if (!confirm("この工程を削除しますか？この操作は取り消せません。")) return;
    startTransition(() => {
      deleteWorkflowNode(node!.id, projectId).then((res) => {
        if (res.error) show(res.error, "error");
        else onDeleted();
      });
    });
  }

  const rules = node.condition_rules ?? [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-none p-4 border-b border-border flex items-start gap-2.5">
        <span className="w-8.5 h-8.5 flex-none rounded-[9px] flex items-center justify-center" style={{ background: meta.tint }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={meta.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={meta.icon} />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold tracking-wide" style={{ color: meta.color }}>
            {meta.label}
          </div>
          <div className="text-sm font-bold mt-0.5 truncate text-primary">{node.label || "（未入力）"}</div>
          <div className="font-mono text-[10.5px] text-faint mt-0.5">
            工程 {stepNumber != null ? String(stepNumber).padStart(2, "0") : "—"} ・ ID {node.id.slice(0, 8)}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4.5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-bold text-secondary">作業内容（何を）</label>
          <Input placeholder="例: 見積内容の承認" {...textFieldProps("label")} />
        </div>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <label className="text-[11.5px] font-bold text-secondary">アクター（誰が）</label>
            <Input list="workflow-actor-options" placeholder="例: 営業担当" {...textFieldProps("role_lane")} />
            <datalist id="workflow-actor-options">
              {actorOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div className="w-26 flex-none flex flex-col gap-1.5">
            <label className="text-[11.5px] font-bold text-secondary">実行区分</label>
            <Select {...selectFieldProps("mode")}>
              <option value="手動">手動</option>
              <option value="自動">自動</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 p-3 rounded-[9px] bg-hover border border-border">
          <div className="text-[11.5px] font-bold text-secondary">利用システム・機能（どの機能で）</div>
          <Input placeholder="例: SFA / 見積作成機能" {...textFieldProps("system_used")} />
          <div className="flex gap-2.5">
            <div className="w-33 flex-none flex flex-col gap-1">
              <label className="text-[10.5px] font-bold text-faint">画面 / API ID</label>
              <Input placeholder="QUO-010" className="font-mono text-xs" {...textFieldProps("screen_id")} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <label className="text-[10.5px] font-bold text-faint">システム区分</label>
              <Select {...selectFieldProps("sys_kind")}>
                <option value="社内システム">社内システム</option>
                <option value="外部連携">外部連携</option>
                <option value="システム外（手作業）">システム外（手作業）</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <label className="text-[11.5px] font-bold text-secondary">入力データ</label>
            <Textarea rows={3} placeholder="例: 商談情報、価格マスタ" {...textFieldProps("input_data")} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <label className="text-[11.5px] font-bold text-secondary">出力データ</label>
            <Textarea rows={3} placeholder="例: 見積ヘッダ・明細" {...textFieldProps("output_data")} />
          </div>
        </div>

        {isCondition && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-[11.5px] font-bold text-secondary">分岐ルール</label>
              <Select className="!h-auto py-1 px-2 text-[11.5px] w-auto" {...selectFieldProps("condition_logic")}>
                <option value="all">すべて満たす (AND)</option>
                <option value="any">いずれか満たす (OR)</option>
              </Select>
            </div>

            {rules.map((r, i) => (
              <div key={i} className="flex flex-col gap-1.5 p-2.5 rounded-[9px]" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                <div className="flex items-center gap-1.5">
                  <Input
                    className="flex-1 min-w-0 !h-8 text-xs"
                    style={{ borderColor: "#fcd34d" }}
                    placeholder="項目（例: 見積金額）"
                    value={r.field}
                    onChange={(e) => updateRules(rules.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)), false)}
                    onBlur={(e) => updateRules(rules.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)), true)}
                  />
                  <Select
                    className="w-16 flex-none !h-8 text-xs text-center"
                    style={{ borderColor: "#fcd34d" }}
                    value={r.op}
                    onChange={(e) => updateRules(rules.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)), true)}
                  >
                    {RULE_OPS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    className="flex-1 min-w-0 !h-8 text-xs font-mono"
                    style={{ borderColor: "#fcd34d" }}
                    placeholder="値を入力"
                    value={r.value}
                    onChange={(e) => updateRules(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)), false)}
                    onBlur={(e) => updateRules(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)), true)}
                  />
                  <button
                    type="button"
                    onClick={() => updateRules(rules.filter((_, j) => j !== i), true)}
                    className="flex-none w-7 h-7 rounded-md flex items-center justify-center cursor-pointer hover:bg-[#fef3c7]"
                    style={{ border: "1px solid #fcd34d", color: "#b45309" }}
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => updateRules([...rules, { field: "", op: "≧", value: "" }], true)}
              className="p-2 rounded-md border border-dashed border-border text-secondary text-xs cursor-pointer hover:bg-hover"
            >
              ＋ ルールを追加
            </button>

            <div className="flex gap-2.5">
              <div className="flex-1 p-2.5 rounded-[9px]" style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                <div className="text-[10px] font-bold tracking-wide" style={{ color: "#047857" }}>
                  YES ルート
                </div>
                <div className="text-[11.5px] mt-1 leading-snug" style={{ color: "#065f46" }}>
                  {branchSummary(allNodes, node.id, "yes")}
                </div>
              </div>
              <div className="flex-1 p-2.5 rounded-[9px]" style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
                <div className="text-[10px] font-bold tracking-wide" style={{ color: "#be123c" }}>
                  NO ルート
                </div>
                <div className="text-[11.5px] mt-1 leading-snug" style={{ color: "#9f1239" }}>
                  {branchSummary(allNodes, node.id, "no")}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-bold text-secondary">業務ルール・制約</label>
          <Textarea rows={3} placeholder="例: 値引率20%超は部長承認が必須" {...textFieldProps("business_rule")} />
        </div>
      </div>

      <div className="flex-none p-3 border-t border-border bg-hover flex gap-2">
        {/* デザインの赤枠アウトラインボタンは既存Buttonのどのvariantとも一致しないため、
            規約40に従いvariantクラスの上書きではなく素の<button>で組む */}
        <button
          type="button"
          onClick={handleDelete}
          className="flex-1 py-2 rounded-md text-xs font-medium cursor-pointer bg-page hover:bg-[#fff1f2]"
          style={{ border: "1px solid #fecdd3", color: "#be123c" }}
        >
          工程を削除
        </button>
        <Button variant="secondary" className="flex-1 justify-center" onClick={onDeselect}>
          選択解除
        </Button>
      </div>
    </div>
  );
}
