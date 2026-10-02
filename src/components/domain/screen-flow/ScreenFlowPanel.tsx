"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addScreenNode,
  confirmScreenNode,
  addScreenTransition,
  linkScreenFunction,
  removeScreenTransition,
  renameScreenNode,
  updateScreenTransitionLabel,
  type ScreenEdge,
  type ScreenNode,
} from "@/actions/screen-transition";
import {
  adoptScreenSuggestion,
  type NodeSuggestion,
  type ScreenSuggestions,
  type TransitionSuggestion,
} from "@/actions/screen-flow-suggestions";
import { ScreenWireframe } from "@/components/domain/screen-wireframe/ScreenWireframe";
import type { FlowSelection } from "@/components/domain/screen-flow/ScreenFlowCanvas";
import { unplacedFunctions, type FlowWarning, type FunctionItem } from "@/lib/screen-flow/derive";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { isItemLocked } from "@/lib/item-lock";
import { errorMessage } from "@/lib/error-message";

const STATUS_PILL: Record<ScreenNode["status"], { label: string; fg: string; bg: string; border: string }> = {
  confirmed: { label: "✓ 確定済", fg: "var(--status-confirmed-text)", bg: "var(--status-confirmed-bg)", border: "var(--status-confirmed-text)" },
  se_reviewing: { label: "要レビュー", fg: "var(--status-review-text)", bg: "var(--status-review-bg)", border: "var(--status-review-text)" },
  ai_draft: { label: "下書き", fg: "var(--text-secondary)", bg: "var(--bg-page)", border: "var(--border)" },
};

const SECTION_LABEL = "font-mono text-[10.5px] font-semibold tracking-wider text-faint uppercase";

// screen_flow_ux_phase1.md Step4：右パネル3モード（未選択・画面ノード選択・遷移選択）。
export function ScreenFlowPanel({
  projectId,
  nodes,
  edges,
  functions,
  suggestions,
  onAdopted,
  bulkBusy,
  onDeleteNode,
  onDeleteEdge,
  onRejectSuggestion,
  warnings,
  selection,
  focusEdgeId,
  onSelect,
}: {
  projectId: string;
  nodes: ScreenNode[];
  edges: ScreenEdge[];
  functions: FunctionItem[];
  suggestions: ScreenSuggestions;
  onAdopted: (kind: "node" | "transition", id: string) => void;
  bulkBusy: boolean;
  // 削除・見送りはキー操作と同じ処理（ScreenFlowScreen側）を呼ぶ
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  warnings: FlowWarning[];
  selection: FlowSelection;
  focusEdgeId: string | null;
  onSelect: (selection: FlowSelection) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();
  const router = useRouter();

  // 失敗時はトーストのあと再取得して、画面をDBの実際の状態に揃える（確定済みになっていた等）
  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        show(errorMessage(e), "error");
        router.refresh();
      }
    });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const node = selection?.type === "node" ? nodeById.get(selection.id) ?? null : null;
  const edge = selection?.type === "edge" ? edges.find((e) => e.id === selection.id) ?? null : null;
  const sNode = selection?.type === "snode" ? suggestions.nodes.find((n) => n.id === selection.id) ?? null : null;
  const sEdge = selection?.type === "sedge" ? suggestions.transitions.find((t) => t.id === selection.id) ?? null : null;
  // 採用・見送りは楽観的更新をしない。操作中（自分のtransition・一括操作・生成）は無効化して連打を防ぐ
  const busy = isPending || bulkBusy;
  const suggestionActions: SuggestionActions = {
    adopt: (s) =>
      run(async () => {
        const r = await adoptScreenSuggestion(s.id, projectId);
        onAdopted(r.kind, r.resultId);
      }),
    reject: (s) => onRejectSuggestion(s.id),
    busy,
  };

  return (
    <div className="flex flex-col gap-4 p-4 border-l border-border" style={{ background: "var(--bg-sidebar)" }} data-screen-flow-panel>
      {sNode ? (
        <SuggestedNodeMode key={sNode.id} suggestion={sNode} functions={functions} projectId={projectId} actions={suggestionActions} />
      ) : sEdge ? (
        <SuggestedEdgeMode key={sEdge.id} suggestion={sEdge} nodeById={nodeById} suggestions={suggestions} onSelect={onSelect} actions={suggestionActions} />
      ) : node ? (
        <NodeMode key={node.id} node={node} nodes={nodes} edges={edges} functions={functions} suggestedOut={suggestions.transitions.filter((t) => t.from.ref === "node" && t.from.id === node.id)} suggestionActions={suggestionActions} onDeleteNode={onDeleteNode} projectId={projectId} onSelect={onSelect} run={run} isPending={busy} />
      ) : edge ? (
        <EdgeMode key={edge.id} onDeleteEdge={onDeleteEdge} autoEdit={focusEdgeId === edge.id} edge={edge} edges={edges} nodeById={nodeById} projectId={projectId} onSelect={onSelect} run={run} isPending={busy} />
      ) : (
        <OverviewMode nodes={nodes} functions={functions} warnings={warnings} projectId={projectId} onSelect={onSelect} run={run} isPending={busy} />
      )}
    </div>
  );
}

type RunFn = (fn: () => Promise<void>) => void;

type SuggestionActions = {
  adopt: (s: NodeSuggestion | TransitionSuggestion) => void;
  reject: (s: NodeSuggestion | TransitionSuggestion) => void;
  busy: boolean;
};

function SuggestionButtons({
  suggestion,
  actions,
  adoptDisabled,
}: {
  suggestion: NodeSuggestion | TransitionSuggestion;
  actions: SuggestionActions;
  adoptDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-suggestion-adopt={suggestion.id}
        disabled={actions.busy || adoptDisabled}
        onClick={() => actions.adopt(suggestion)}
        className="text-[11.5px] font-medium px-3 py-1.5 rounded-md text-white cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--brand)" }}
      >
        採用
      </button>
      <button
        type="button"
        data-suggestion-reject={suggestion.id}
        disabled={actions.busy}
        onClick={() => actions.reject(suggestion)}
        className="text-[11.5px] font-medium px-3 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover whitespace-nowrap disabled:opacity-50"
      >
        見送り
      </button>
    </div>
  );
}

function SuggestionPill() {
  return (
    <span
      className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
      style={{ color: "var(--brand)", borderColor: "var(--brand)", background: "var(--bg-page)", borderStyle: "dashed" }}
    >
      AI提案
    </span>
  );
}

function WhyBlock({ why }: { why: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={SECTION_LABEL}>根拠</span>
      <p data-suggestion-why className="text-[12px] text-secondary rounded-md border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
        {why}
      </p>
    </div>
  );
}

// 提案ノードの選択モード：読み取り専用。確定ボタンは出さない（採用後に通常の画面として扱う）。
function SuggestedNodeMode({
  suggestion,
  functions,
  projectId,
  actions,
}: {
  suggestion: NodeSuggestion;
  functions: FunctionItem[];
  projectId: string;
  actions: SuggestionActions;
}) {
  const linked = suggestion.function_item_id ? functions.find((f) => f.id === suggestion.function_item_id) ?? null : null;
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <SuggestionPill />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL}>画面名</span>
        <div data-screen-name className="rounded-md border px-3 py-2 text-[14px] font-bold text-primary" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
          {suggestion.name}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>9章の画面情報</span>
        {linked ? (
          <>
            <div className="text-[12.5px] text-primary">
              <span className="font-mono text-[10px] text-faint mr-1.5">{linked.code}</span>
              {linked.name}
            </div>
            <div className="rounded-md border overflow-hidden" style={{ height: 150, borderColor: "var(--border)", background: "var(--bg-page)" }}>
              <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: "200%", pointerEvents: "none" }}>
                <ScreenWireframe screenName={linked.name} pattern={linked.pattern} fields={linked.fields} actions={linked.actions} />
              </div>
            </div>
            <Link href={`/projects/${projectId}/chapters/9/screens`} className="text-[11.5px] underline text-secondary hover:text-primary">
              画面イメージを開く
            </Link>
          </>
        ) : (
          <p className="text-xs text-secondary">紐付けなしの提案です。</p>
        )}
      </div>
      <WhyBlock why={suggestion.why} />
      <SuggestionButtons suggestion={suggestion} actions={actions} />
    </>
  );
}

// 提案遷移の選択モード。端点が未採用の提案ノードのときは採用できない。
function SuggestedEdgeMode({
  suggestion,
  nodeById,
  suggestions,
  onSelect,
  actions,
}: {
  suggestion: TransitionSuggestion;
  nodeById: Map<string, ScreenNode>;
  suggestions: ScreenSuggestions;
  onSelect: (s: FlowSelection) => void;
  actions: SuggestionActions;
}) {
  const endpoint = (e: TransitionSuggestion["from"]) => {
    const label = e.ref === "node" ? nodeById.get(e.id)?.label ?? e.name : suggestions.nodes.find((n) => n.id === e.id)?.name ?? e.name;
    const sel: FlowSelection = e.ref === "node" ? { type: "node", id: e.id } : { type: "snode", id: e.id };
    return { label, sel };
  };
  const from = endpoint(suggestion.from);
  const to = endpoint(suggestion.to);
  const needsAdopt = suggestion.from.ref === "suggestion" || suggestion.to.ref === "suggestion";
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <SuggestionPill />
        <span className={SECTION_LABEL}>遷移</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onSelect(from.sel)} className="text-[12px] font-bold px-2.5 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover">
          {from.label}
        </button>
        <span className="text-faint">→</span>
        <button type="button" onClick={() => onSelect(to.sel)} className="text-[12px] font-bold px-2.5 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover">
          {to.label}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL}>遷移のきっかけ（操作名）</span>
        <div data-edge-label-field className="rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
          {suggestion.label || <span className="text-faint">（操作名なし）</span>}
        </div>
      </div>
      <WhyBlock why={suggestion.why} />
      {needsAdopt && (
        <p data-suggestion-needs-adopt className="text-[11.5px]" style={{ color: "var(--status-review-text)" }}>
          先に画面を採用してください。
        </p>
      )}
      <SuggestionButtons suggestion={suggestion} actions={actions} adoptDisabled={needsAdopt} />
    </>
  );
}

function OverviewMode({
  nodes,
  functions,
  warnings,
  projectId,
  onSelect,
  run,
  isPending,
}: {
  nodes: ScreenNode[];
  functions: FunctionItem[];
  warnings: FlowWarning[];
  projectId: string;
  onSelect: (s: FlowSelection) => void;
  run: RunFn;
  isPending: boolean;
}) {
  const unplaced = unplacedFunctions(functions, nodes);
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>要確認 {warnings.length}</span>
        {warnings.length === 0 ? (
          <p className="text-xs text-secondary">問題はありません。</p>
        ) : (
          warnings.map((w) => (
            <button
              key={w.nodeId}
              type="button"
              onClick={() => onSelect({ type: "node", id: w.nodeId })}
              className="text-left rounded-md border px-3 py-2 cursor-pointer hover:bg-hover"
              style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}
            >
              <div className="text-[12.5px] font-bold text-primary truncate">{w.name}</div>
              <div className="text-[11px]" style={{ color: "var(--status-review-text)" }}>
                {w.reason}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>9章にあって図にない画面 {unplaced.length}</span>
        {unplaced.length === 0 ? (
          <p className="text-xs text-secondary">すべての画面が図に含まれています。</p>
        ) : (
          unplaced.map((f) => (
            <div
              key={f.id}
              data-unplaced-function={f.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] text-faint">{f.code}</div>
                <div className="text-[12.5px] font-bold text-primary truncate">{f.name}</div>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const id = await addScreenNode(projectId, { name: f.name, functionItemId: f.id });
                    onSelect({ type: "node", id });
                  })
                }
                className="text-[11.5px] font-medium px-3 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover whitespace-nowrap disabled:opacity-50"
              >
                図に追加
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function NodeMode({
  node,
  nodes,
  edges,
  functions,
  suggestedOut,
  suggestionActions,
  onDeleteNode,
  projectId,
  onSelect,
  run,
  isPending,
}: {
  onDeleteNode: (nodeId: string) => void;
  node: ScreenNode;
  nodes: ScreenNode[];
  edges: ScreenEdge[];
  functions: FunctionItem[];
  suggestedOut: TransitionSuggestion[];
  suggestionActions: SuggestionActions;
  projectId: string;
  onSelect: (s: FlowSelection) => void;
  run: RunFn;
  isPending: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [addingTarget, setAddingTarget] = useState(false);
  const pill = STATUS_PILL[node.status];
  // 確定済み（isItemLocked）のノードは画面名・9章紐付け・遷移先（このノードを遷移元とする遷移）を編集できない
  const locked = isItemLocked(node.status);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const functionById = new Map(functions.map((f) => [f.id, f]));
  const linked = node.function_item_id ? functionById.get(node.function_item_id) ?? null : null;

  const outgoing = edges.filter((e) => e.from_node === node.id);
  const incoming = edges.filter((e) => e.to_node === node.id);
  const targetIds = new Set(outgoing.map((e) => e.to_node));
  const addableTargets = nodes.filter((n) => n.id !== node.id && !targetIds.has(n.id));
  const candidates = unplacedFunctions(functions, nodes);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[11px] text-faint">{node.screen_code ?? ""}</span>
        <span
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
          style={{ background: pill.bg, color: pill.fg, borderColor: pill.border }}
        >
          {pill.label}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL}>画面名</span>
        {editingName && !locked ? (
          <Input
            autoFocus
            defaultValue={node.label}
            onBlur={(e) => {
              const v = e.target.value.trim();
              setEditingName(false);
              if (v && v !== node.label) run(() => renameScreenNode(node.id, projectId, v));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : (
          <div
            data-screen-name
            onClick={() => !locked && setEditingName(true)}
            className={`${locked ? "" : "cursor-text "}rounded-md border px-3 py-2 text-[14px] font-bold text-primary`}
            style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}
          >
            {node.label}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>9章の画面情報</span>
        {linked ? (
          <>
            <div className="text-[12.5px] text-primary">
              <span className="font-mono text-[10px] text-faint mr-1.5">{linked.code}</span>
              {linked.name}
            </div>
            {/* 既存の画面イメージ（ScreenWireframe）を縮小表示で再利用する（新しく描画しない） */}
            <div className="rounded-md border overflow-hidden" style={{ height: 150, borderColor: "var(--border)", background: "var(--bg-page)" }}>
              <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: "200%", pointerEvents: "none" }}>
                <ScreenWireframe screenName={linked.name} pattern={linked.pattern} fields={linked.fields} actions={linked.actions} />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-[11.5px]">
              <Link href={`/projects/${projectId}/chapters/9/screens`} className="underline text-secondary hover:text-primary">
                画面イメージを開く
              </Link>
              {!locked && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => linkScreenFunction(node.id, projectId, null))}
                  className="underline text-secondary hover:text-primary cursor-pointer disabled:opacity-50"
                >
                  紐付けを外す
                </button>
              )}
            </div>
          </>
        ) : (
          <div
            className="rounded-md border p-3 flex flex-col gap-2"
            style={{ background: "var(--status-review-bg)", borderColor: "var(--status-review-text)" }}
          >
            <p className="text-[11.5px]" style={{ color: "var(--status-review-text)" }}>
              この画面は9章の画面情報に紐付いていません。{node.function_item_id ? "（紐付け先の項目は画面情報を持っていません）" : "下の候補から選んで紐付けてください。"}
            </p>
            {locked ? null : candidates.length === 0 ? (
              <p className="text-[11px] text-secondary">紐付けられる未使用の9章画面はありません。</p>
            ) : (
              <div className="flex flex-col gap-1">
                {candidates.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    data-link-candidate={f.id}
                    disabled={isPending}
                    onClick={() => run(() => linkScreenFunction(node.id, projectId, f.id))}
                    className="text-left text-[12px] rounded-md border px-2.5 py-1.5 cursor-pointer hover:bg-hover disabled:opacity-50"
                    style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}
                  >
                    <span className="font-mono text-[10px] text-faint mr-1.5">{f.code}</span>
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>遷移先 {outgoing.length}</span>
        <p className="text-[11px] text-faint">複数の遷移先を並列に持てます。</p>
        {outgoing.map((e) => (
          <div
            key={e.id}
            data-outgoing-edge={e.id}
            className="flex items-center gap-2 rounded-md border px-3 py-2"
            style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}
          >
            <button type="button" onClick={() => onSelect({ type: "edge", id: e.id })} className="flex-1 min-w-0 text-left cursor-pointer">
              <div className="text-[12.5px] font-bold text-primary truncate">→ {nodeById.get(e.to_node)?.label ?? "（不明）"}</div>
              <div className="text-[11px] text-faint truncate">{e.label || "（操作名なし）"}</div>
            </button>
            <button
              type="button"
              aria-label="遷移を削除"
              disabled={isPending || locked}
              onClick={() => run(() => removeScreenTransition(e.id, projectId))}
              className={`text-faint hover:text-primary cursor-pointer px-1 disabled:opacity-50${locked ? " hidden" : ""}`}
            >
              ×
            </button>
          </div>
        ))}
        {suggestedOut.map((t) => {
          const toIsSuggestion = t.to.ref === "suggestion";
          return (
            <div
              key={t.id}
              data-suggested-outgoing={t.id}
              className="flex flex-col gap-1.5 rounded-md px-3 py-2"
              style={{ border: "1.5px dashed var(--brand)", background: "var(--bg-page)" }}
            >
              <button type="button" onClick={() => onSelect({ type: "sedge", id: t.id })} className="text-left cursor-pointer">
                <div className="text-[12.5px] font-bold text-primary truncate">
                  <span className="text-[10px] font-medium mr-1.5" style={{ color: "var(--brand)" }}>AI提案</span>→ {t.to.name}
                </div>
                <div className="text-[11px] text-faint truncate">{t.label || "（操作名なし）"}</div>
              </button>
              {toIsSuggestion && <p className="text-[11px]" style={{ color: "var(--status-review-text)" }}>先に画面を採用してください。</p>}
              <SuggestionButtons suggestion={t} actions={suggestionActions} adoptDisabled={toIsSuggestion} />
            </div>
          );
        })}
        {locked ? null : addingTarget ? (
          <div className="flex flex-wrap gap-1.5">
            {addableTargets.length === 0 ? (
              <span className="text-[11px] text-faint">追加できる画面がありません。</span>
            ) : (
              addableTargets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-add-target={t.id}
                  disabled={isPending}
                  onClick={() =>
                    run(async () => {
                      await addScreenTransition(projectId, node.id, t.id);
                      setAddingTarget(false);
                    })
                  }
                  className="text-[11.5px] px-2.5 py-1 rounded-full border border-border bg-page cursor-pointer hover:bg-hover disabled:opacity-50"
                >
                  {t.label}
                </button>
              ))
            )}
            <button type="button" onClick={() => setAddingTarget(false)} className="text-[11px] text-faint underline cursor-pointer">
              閉じる
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingTarget(true)}
            className="text-left px-3 py-2 rounded-lg border border-dashed border-border text-xs text-faint cursor-pointer hover:bg-page hover:text-brand"
          >
            ＋ 遷移先を追加
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>遷移元 {incoming.length}</span>
        {incoming.length === 0 ? (
          <p className="text-xs text-secondary">なし（起点の画面として扱います）</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {incoming.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onSelect({ type: "node", id: e.from_node })}
                className="text-[11.5px] px-2.5 py-1 rounded-full border border-border bg-page cursor-pointer hover:bg-hover"
              >
                {nodeById.get(e.from_node)?.label ?? "（不明）"}
              </button>
            ))}
          </div>
        )}
      </div>

      {locked && <p className="text-[11px] text-faint">確定済みのため編集できません。</p>}

      {/* アクションバー（sticky bottom）：未確定なら「この画面を確定」、確定済みなら静的表示。画面を削除は常に表示 */}
      <div className="sticky bottom-0 -mx-4 -mb-4 px-4 py-3 border-t border-border flex items-center gap-2" style={{ background: "var(--bg-sidebar)" }}>
        {locked ? (
          <span
            className="text-[12px] font-medium px-3 py-2 rounded-md whitespace-nowrap"
            style={{ background: "var(--status-confirmed-bg)", color: "var(--status-confirmed-text)", border: "1px solid var(--status-confirmed-text)" }}
          >
            ✓ 確定済
          </span>
        ) : (
          <button
            type="button"
            data-confirm-node
            disabled={isPending}
            onClick={() => run(() => confirmScreenNode(node.id, projectId))}
            className="text-[12px] font-medium px-3 py-2 rounded-md text-white cursor-pointer whitespace-nowrap disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            この画面を確定
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => onDeleteNode(node.id)}
          className="ml-auto text-[12px] font-medium px-3 py-2 rounded-md border cursor-pointer hover:bg-hover disabled:opacity-50"
          style={{ borderColor: "var(--status-needhearing-text)", color: "var(--status-needhearing-text)" }}
        >
          画面を削除
        </button>
      </div>
    </>
  );
}

function EdgeMode({
  onDeleteEdge,
  autoEdit,
  edge,
  edges,
  nodeById,
  projectId,
  onSelect,
  run,
  isPending,
}: {
  onDeleteEdge: (edgeId: string) => void;
  autoEdit: boolean;
  edge: ScreenEdge;
  edges: ScreenEdge[];
  nodeById: Map<string, ScreenNode>;
  projectId: string;
  onSelect: (s: FlowSelection) => void;
  run: RunFn;
  isPending: boolean;
}) {
  // ポートからの作成直後は、操作名入力にフォーカスを当てる（autoEdit）
  const [editingLabel, setEditingLabel] = useState(autoEdit);
  const from = nodeById.get(edge.from_node);
  // 遷移の編集可否は遷移元ノードのロック状態で決める（遷移先ではない）
  const locked = from ? isItemLocked(from.status) : false;
  const to = nodeById.get(edge.to_node);
  const hasReverse = edges.some((e) => e.from_node === edge.to_node && e.to_node === edge.from_node);

  return (
    <>
      <span className={SECTION_LABEL}>遷移</span>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => from && onSelect({ type: "node", id: from.id })}
          className="text-[12px] font-bold px-2.5 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover"
        >
          {from?.label ?? "（不明）"}
        </button>
        <span className="text-faint">→</span>
        <button
          type="button"
          onClick={() => to && onSelect({ type: "node", id: to.id })}
          className="text-[12px] font-bold px-2.5 py-1.5 rounded-md border border-border bg-page cursor-pointer hover:bg-hover"
        >
          {to?.label ?? "（不明）"}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL}>遷移のきっかけ（操作名）</span>
        {editingLabel && !locked ? (
          <Input
            key={`${edge.id}-${edge.label ?? ""}`}
            autoFocus
            defaultValue={edge.label ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              setEditingLabel(false);
              if (v.trim() !== (edge.label ?? "")) run(() => updateScreenTransitionLabel(edge.id, projectId, v));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingLabel(false);
            }}
          />
        ) : (
          <div
            data-edge-label-field
            onClick={() => !locked && setEditingLabel(true)}
            className={`${locked ? "" : "cursor-text "}rounded-md border px-3 py-2 text-[13px]`}
            style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}
          >
            {edge.label || <span className="text-faint">{locked ? "（操作名なし）" : "（クリックして操作名を入力）"}</span>}
          </div>
        )}
      </div>

      {locked && <p className="text-[11px] text-faint">遷移元の画面が確定済みのため編集できません。</p>}

      {!locked && (
      <div className="mt-2 pt-4 border-t border-border flex items-center gap-2 flex-wrap">
        {!hasReverse && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const id = await addScreenTransition(projectId, edge.to_node, edge.from_node);
                onSelect({ type: "edge", id });
              })
            }
            className="text-[12px] font-medium px-3 py-2 rounded-md border border-border bg-page cursor-pointer hover:bg-hover disabled:opacity-50"
          >
            戻りの遷移を追加
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => onDeleteEdge(edge.id)}
          className="text-[12px] font-medium px-3 py-2 rounded-md border cursor-pointer hover:bg-hover disabled:opacity-50"
          style={{ borderColor: "var(--status-needhearing-text)", color: "var(--status-needhearing-text)" }}
        >
          遷移を削除
        </button>
      </div>
      )}
    </>
  );
}
