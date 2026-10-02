"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addScreenTransition,
  moveScreenNode,
  moveScreenNodes,
  removeScreenNode,
  removeScreenTransition,
  type ScreenEdge,
  type ScreenNode,
} from "@/actions/screen-transition";
import {
  adoptAllScreenSuggestions,
  generateScreenFlowSuggestions,
  rejectAllScreenSuggestions,
  rejectScreenSuggestion,
  type ScreenSuggestions,
} from "@/actions/screen-flow-suggestions";
import { Spinner } from "@/components/ui/spinner";
import { ScreenFlowCanvas, type FlowSelection } from "@/components/domain/screen-flow/ScreenFlowCanvas";
import { ScreenFlowPanel } from "@/components/domain/screen-flow/ScreenFlowPanel";
import { clampPosition, degrees, flowWarnings, nodePosition, stageSizeFor, type FunctionItem } from "@/lib/screen-flow/derive";
import { isItemLocked } from "@/lib/item-lock";
import { autoLayoutPositions } from "@/lib/screen-flow/layout";
import { errorMessage } from "@/lib/error-message";
import { useToast } from "@/components/ui/toast";

// screen_flow_ux_phase1/2.md：キャンバス（主役）＋右パネルの2カラム構成のオーケストレータ。
// 業務フロー・KPI・非機能要件と同じ「page.tsxは薄いラッパー、ローカル状態はここ」の形。
export function ScreenFlowScreen({
  projectId,
  nodes,
  edges,
  functions,
  suggestions,
}: {
  projectId: string;
  nodes: ScreenNode[];
  edges: ScreenEdge[];
  functions: FunctionItem[];
  suggestions: ScreenSuggestions;
}) {
  const [selection, setSelection] = useState<FlowSelection>(null);
  // ポートから作成した直後の遷移id、またはAI提案の採用で作られた実ノード/実遷移のid。
  // 再取得データに現れるまで選択を解除しない（作成直後に選択・フォーカスが消えないようにする）。
  // 別の対象を選んだ時点で破棄する。
  const [pendingEdgeId, setPendingEdgeId] = useState<string | null>(null);
  const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null);
  const [posOverrides, setPosOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [, startTransition] = useTransition();
  // AI提案の生成・一括採用・一括見送り。操作中は他の提案操作ボタンを無効にして連打を防ぐ。
  // 採用・見送りは楽観的更新をしない（提案と実ノード/遷移は同じ再取得で同時に切り替わる）。
  const [bulkPending, startBulk] = useTransition();
  const [generating, setGenerating] = useState(false);
  // 削除など、サーバーの応答後に画面が変わる操作の実行中フラグ（連打防止。ボタンを無効化する）
  const [actionPending, startAction] = useTransition();
  const { show } = useToast();
  const router = useRouter();

  // 失敗時の共通処理（screen_flow_ux_phase4.md Step5）：エラートーストを出し、再取得して
  // 画面をDBの実際の状態に揃える（確定済みになっていた等、状態の食い違いによる拒否にも対応）。
  function fail(e: unknown) {
    show(errorMessage(e), "error");
    router.refresh();
  }

  // 矢印キー移動の保存は、最後の入力から400ms後にまとめて1回行う。保留中の分は、選択の
  // 切り替え・Esc・フォーカス喪失・アンマウント時に即時に保存する。
  const pendingMovesRef = useRef(new Map<string, { x: number; y: number }>());
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 規約59：ドロップ/整列直後からサーバーの再取得データが届くまで、座標の上書き値を保持して
  // 元の位置へ一瞬戻らないようにする。実データが上書き値に追いついた分は、useEffectでの
  // 後片付けをせずレンダー計算の中で単純に無視する（規約54）。複数ノード分を保持できる。
  const displayNodes = useMemo(() => {
    if (posOverrides.size === 0) return nodes;
    return nodes.map((n, i) => {
      const ov = posOverrides.get(n.id);
      if (!ov) return n;
      const real = nodePosition(n, i);
      if (real.x === ov.x && real.y === ov.y) return n;
      return { ...n, pos_x: ov.x, pos_y: ov.y };
    });
  }, [nodes, posOverrides]);

  const deg = useMemo(() => degrees(displayNodes, edges), [displayNodes, edges]);
  const warnings = useMemo(() => flowWarnings(displayNodes, edges), [displayNodes, edges]);
  const confirmedCount = displayNodes.filter((n) => n.status === "confirmed").length;

  // 選択対象が削除・見送り・置き換え等で存在しなくなった場合は未選択として扱う
  // （採用直後の実ノード/実遷移は、再取得データに現れるまで除く）
  const exists =
    !selection ||
    (selection.type === "node" && (nodes.some((n) => n.id === selection.id) || selection.id === pendingEdgeId)) ||
    (selection.type === "edge" && (edges.some((e) => e.id === selection.id) || selection.id === pendingEdgeId)) ||
    (selection.type === "snode" && suggestions.nodes.some((n) => n.id === selection.id)) ||
    (selection.type === "sedge" && suggestions.transitions.some((t) => t.id === selection.id));
  const effectiveSelection: FlowSelection = exists ? selection : null;
  const suggestionCount = suggestions.nodes.length + suggestions.transitions.length;

  // 提案の採用で作られた実ノード/実遷移を選択する
  function handleAdopted(kind: "node" | "transition", id: string) {
    flushMoves();
    setSelection({ type: kind === "node" ? "node" : "edge", id });
    setPendingEdgeId(id);
    setFocusEdgeId(null);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await generateScreenFlowSuggestions(projectId);
      show(r.nodes + r.transitions === 0 ? "追加の提案はありませんでした" : `画面${r.nodes}件・遷移${r.transitions}件を提案しました`);
    } catch (e) {
      fail(e);
    } finally {
      setGenerating(false);
    }
  }
  function handleAdoptAll() {
    startBulk(async () => {
      try {
        const r = await adoptAllScreenSuggestions(projectId);
        show(r.failed > 0 ? `${r.adopted}件を採用しました（${r.failed}件は採用できませんでした）` : `${r.adopted}件を採用しました`, r.adopted === 0 ? "error" : "success");
      } catch (e) {
        fail(e);
      }
    });
  }
  function handleRejectAll() {
    startBulk(async () => {
      try {
        await rejectAllScreenSuggestions(projectId);
      } catch (e) {
        fail(e);
      }
    });
  }

  function handleSelect(next: FlowSelection) {
    flushMoves();
    setSelection(next);
    setPendingEdgeId(null);
    setFocusEdgeId(null);
  }

  function setOverrides(entries: { id: string; x: number; y: number }[]) {
    setPosOverrides((prev) => {
      const next = new Map(prev);
      for (const e of entries) next.set(e.id, { x: e.x, y: e.y });
      return next;
    });
  }
  function clearOverrides(ids: string[]) {
    setPosOverrides((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  function flushMoves() {
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    const moves = [...pendingMovesRef.current.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    pendingMovesRef.current.clear();
    if (moves.length === 0) return;
    // アンマウント時にも呼ぶためstartTransitionは使わず、try/catchで失敗を拾う（規約44）
    void (async () => {
      try {
        await moveScreenNodes(projectId, moves);
      } catch (e) {
        clearOverrides(moves.map((m) => m.id));
        fail(e);
      }
    })();
  }
  const flushMovesRef = useRef(flushMoves);
  useEffect(() => {
    flushMovesRef.current = flushMoves;
  });
  useEffect(() => () => flushMovesRef.current(), []);

  // 矢印キー：選択中の実ノードを論理座標で動かす。クランプは「動かすノード自身を除く」
  // 内容から求めたステージ寸法で行う（自分の位置でステージが広がり続けないようにする）。
  function handleNudge(nodeId: string, dx: number, dy: number) {
    const idx = displayNodes.findIndex((n) => n.id === nodeId);
    if (idx < 0) return;
    const cur = pendingMovesRef.current.get(nodeId) ?? nodePosition(displayNodes[idx], idx);
    const others = [
      ...displayNodes.map((n, i) => nodePosition(n, i)).filter((_, i) => i !== idx),
      ...suggestions.nodes.map((n) => ({ x: n.x, y: n.y })),
    ];
    const next = clampPosition(cur.x + dx, cur.y + dy, stageSizeFor(others));
    const pos = { x: Math.round(next.x), y: Math.round(next.y) };
    setOverrides([{ id: nodeId, ...pos }]);
    pendingMovesRef.current.set(nodeId, pos);
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    moveTimerRef.current = setTimeout(flushMoves, 400);
  }

  // 削除：右パネルのボタンとキー（Delete/Backspace）で同じ処理を呼ぶ（キー専用の別実装は作らない）
  function deleteNode(nodeId: string) {
    const n = nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const count = edges.filter((e) => e.from_node === nodeId || e.to_node === nodeId).length;
    const head = isItemLocked(n.status) ? "確定済みの画面です。" : "";
    if (!confirm(`${head}「${n.label}」を削除しますか？接続する遷移（${count}件）も一緒に削除されます。`)) return;
    flushMoves();
    startAction(async () => {
      try {
        await removeScreenNode(nodeId, projectId);
        setSelection(null);
      } catch (e) {
        fail(e);
      }
    });
  }
  function deleteEdge(edgeId: string) {
    const e = edges.find((x) => x.id === edgeId);
    const from = e ? nodes.find((n) => n.id === e.from_node) : undefined;
    if (!e) return;
    if (from && isItemLocked(from.status)) {
      show("確定済みの画面からの遷移は削除できません", "error");
      return;
    }
    startAction(async () => {
      try {
        await removeScreenTransition(edgeId, projectId);
        setSelection(null);
      } catch (err) {
        fail(err);
      }
    });
  }
  function rejectSuggestion(id: string) {
    startAction(async () => {
      try {
        await rejectScreenSuggestion(id, projectId);
        setSelection(null);
      } catch (e) {
        fail(e);
      }
    });
  }
  function handleDeleteKey() {
    if (actionPending || bulkPending || generating || !effectiveSelection) return;
    const sel = effectiveSelection;
    if (sel.type === "node") deleteNode(sel.id);
    else if (sel.type === "edge") deleteEdge(sel.id);
    else rejectSuggestion(sel.id);
  }

  function handleMove(nodeId: string, x: number, y: number) {
    const pos = { id: nodeId, x: Math.round(x), y: Math.round(y) };
    setOverrides([pos]);
    handleSelect({ type: "node", id: nodeId });
    startTransition(async () => {
      try {
        await moveScreenNode(nodeId, projectId, pos.x, pos.y);
      } catch (e) {
        clearOverrides([nodeId]);
        fail(e);
      }
    });
  }

  function handleConnect(fromId: string, toId: string) {
    if (edges.some((e) => e.from_node === fromId && e.to_node === toId)) {
      show("既にこの遷移があります", "error");
      return;
    }
    startTransition(async () => {
      try {
        const id = await addScreenTransition(projectId, fromId, toId);
        flushMoves();
        setSelection({ type: "edge", id });
        setPendingEdgeId(id);
        setFocusEdgeId(id);
      } catch (e) {
        fail(e);
      }
    });
  }

  // 自動で整列：座標は純粋関数（src/lib/screen-flow/layout.ts）で計算し、その結果を上書き値
  // として即時反映したうえで、まとめて保存する。失敗時は上書きを取り除いて元の位置へ戻す。
  function handleAutoLayout() {
    if (nodes.length === 0) return;
    if (!confirm("手動で配置した位置がすべて上書きされます。よろしいですか？")) return;
    const layout = autoLayoutPositions(nodes, edges);
    const moves = [...layout.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    setOverrides(moves);
    startTransition(async () => {
      try {
        await moveScreenNodes(projectId, moves);
      } catch (e) {
        clearOverrides(moves.map((m) => m.id));
        fail(e);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3" data-screen-flow-root>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          data-screen-flow-summary-confirmed
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
          style={{ borderColor: "var(--status-confirmed-text)", color: "var(--status-confirmed-text)", background: "var(--status-confirmed-bg)" }}
        >
          確定 {confirmedCount}/{displayNodes.length}
        </span>
        <span
          data-screen-flow-summary-warnings
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap"
          style={
            warnings.length > 0
              ? { borderColor: "var(--status-review-text)", color: "var(--status-review-text)", background: "var(--status-review-bg)" }
              : { borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-page)" }
          }
        >
          要確認 {warnings.length}
        </span>
        {suggestionCount > 0 && (
          <div
            data-screen-flow-suggestion-bar
            className="flex items-center gap-2 rounded-md px-2.5 py-1"
            style={{ border: "1.5px dashed var(--brand)" }}
          >
            <span className="text-[11.5px] font-medium" style={{ color: "var(--brand)" }}>
              AI提案 {suggestionCount} 件
            </span>
            <button
              type="button"
              data-suggestion-adopt-all
              disabled={bulkPending || generating}
              onClick={handleAdoptAll}
              className="text-[11.5px] font-medium px-2.5 py-1 rounded-md text-white cursor-pointer disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              すべて採用
            </button>
            <button
              type="button"
              data-suggestion-reject-all
              disabled={bulkPending || generating}
              onClick={handleRejectAll}
              className="text-[11.5px] font-medium px-2.5 py-1 rounded-md border border-border bg-page cursor-pointer hover:bg-hover disabled:opacity-50"
            >
              すべて見送り
            </button>
          </div>
        )}
        <button
          type="button"
          data-suggest-generate
          onClick={handleGenerate}
          disabled={generating || bulkPending}
          className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-md border border-border bg-page cursor-pointer hover:bg-hover whitespace-nowrap disabled:opacity-50"
        >
          {generating ? (
            <>
              <Spinner /> 生成中…
            </>
          ) : (
            "AI素案（差分で提案）"
          )}
        </button>
        <button
          type="button"
          onClick={handleAutoLayout}
          disabled={displayNodes.length === 0 || actionPending}
          className="text-[12px] font-medium px-3 py-2 rounded-md border border-border bg-page cursor-pointer hover:bg-hover whitespace-nowrap disabled:opacity-50"
        >
          自動で整列
        </button>
      </div>

      <p data-screen-flow-hint className="hidden md:block text-right pr-1 text-[11px] text-faint -mt-1">
        ドラッグで移動　●から遷移を作成　Space+ドラッグでパン　Ctrl/⌘+ホイールでズーム　Deleteで削除
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_316px] gap-0 items-start">
        <ScreenFlowCanvas
          nodes={displayNodes}
          edges={edges}
          functions={functions}
          suggestions={suggestions}
          degrees={deg}
          selection={effectiveSelection}
          onSelect={handleSelect}
          onMove={handleMove}
          onConnect={handleConnect}
          onDelete={handleDeleteKey}
          onNudge={handleNudge}
          onFlush={flushMoves}
        />
        <ScreenFlowPanel
          projectId={projectId}
          nodes={displayNodes}
          edges={edges}
          functions={functions}
          suggestions={suggestions}
          onAdopted={handleAdopted}
          bulkBusy={bulkPending || generating || actionPending}
          onDeleteNode={deleteNode}
          onDeleteEdge={deleteEdge}
          onRejectSuggestion={rejectSuggestion}
          warnings={warnings}
          selection={effectiveSelection}
          focusEdgeId={focusEdgeId}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
