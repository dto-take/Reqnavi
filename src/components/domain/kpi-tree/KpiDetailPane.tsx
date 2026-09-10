"use client";

import { useTransition } from "react";
import {
  updateKpiNodeField,
  deleteKpiNode,
  createKpiNode,
  moveKpiNodeUpDown,
  changeKpiNodeLevel,
  duplicateKpiNode,
  type KpiNode,
} from "@/actions/kpi-tree";
import { KPI_LEVELS, type KpiLevel } from "@/lib/kpi-levels";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Textarea } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { KpiCandidatePanel } from "@/components/domain/kpi-tree/KpiCandidatePanel";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";
import { isItemLocked } from "@/lib/item-lock";

function nextLevel(level: KpiLevel): KpiLevel | null {
  const idx = KPI_LEVELS.indexOf(level);
  return idx < KPI_LEVELS.length - 1 ? KPI_LEVELS[idx + 1] : null;
}

export function KpiDetailPane({
  projectId,
  tenantId,
  nodes,
  selectedNode,
  onSelect,
  onCreated,
  autoFocusId,
  visibleFlatList,
  onConfirm,
  confirmPending,
}: {
  projectId: string;
  tenantId: string;
  nodes: KpiNode[];
  selectedNode: KpiNode | null;
  onSelect: (id: string) => void;
  // kpi_add_goal.md Step1：目標/戦略/戦術等の新規追加時も、選択に加えて本文入力へフォーカスを
  // 当てる（KpiTree.tsx側のselectAndFocus）。ノード切替のみのonSelectとは区別する。
  onCreated: (id: string) => void;
  // 直近で新規作成され、まだフォーカスを当てていないノードID（一致する間だけ本文欄にautoFocusする）
  autoFocusId: string | null;
  // kpi_ux_phase2.md Step4：折りたたみ状態を反映した表示中の平坦なノード順序。
  // 「N / M件目」の表示と、「確定して次へ」の遷移先の計算に使う（KpiTree.tsx側で計算）。
  visibleFlatList: KpiNode[];
  // フェーズ4 Step3：Cmd/Ctrl+Enterのキーボードショートカットからも同じ処理を呼べるよう、
  // 確定ロジック自体（Server Action呼び出し＋次ノードへの遷移）をKpiTree.tsx側に引き上げた。
  onConfirm: (nodeId: string) => void;
  confirmPending: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  if (!selectedNode) {
    return (
      <div
        className="border border-border rounded-lg bg-page flex items-center justify-center text-sm text-faint"
        style={{ minHeight: 320 }}
      >
        左のツリーから項目を選択してください
      </div>
    );
  }

  const locked = isItemLocked(selectedNode.status);

  // パンくず：parent_idを祖先へ辿る（選択ノード自身は含めない。種別ピルで別途表示する）
  const breadcrumb: KpiNode[] = [];
  let cursorId = selectedNode.parent_id;
  while (cursorId) {
    const parent = nodes.find((n) => n.id === cursorId);
    if (!parent) break;
    breadcrumb.unshift(parent);
    cursorId = parent.parent_id;
  }

  const childLevel = nextLevel(selectedNode.content.level);
  const childCount = nodes.filter((n) => n.parent_id === selectedNode.id).length;
  const flatIndex = visibleFlatList.findIndex((n) => n.id === selectedNode.id);
  const positionLabel = flatIndex >= 0 ? `${flatIndex + 1} / ${visibleFlatList.length} 件目` : null;

  // フェーズ4：上へ/下へ移動・1段上げる/下げるの各メニュー項目を、実行しても意味が無い
  // 境界では無効化する（サーバー側のmoveKpiNodeUpDown/changeKpiNodeLevelも同じ境界を
  // 「範囲外は何もしない／throw」で防御しているが、UI側でも操作可能に見せない）。
  const siblings = nodes.filter((n) => n.parent_id === selectedNode.parent_id);
  const siblingIndex = siblings.findIndex((n) => n.id === selectedNode.id);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex >= 0 && siblingIndex < siblings.length - 1;
  const parentNode = selectedNode.parent_id ? nodes.find((n) => n.id === selectedNode.parent_id) ?? null : null;
  const canPromote = selectedNode.content.level !== "ゴール" && !!parentNode?.parent_id;
  const canDemote = selectedNode.content.level !== "戦術" && siblingIndex > 0;

  function handleFieldBlur(field: "text" | "metric" | "owner" | "due_date", value: string) {
    const node = selectedNode;
    if (!node) return;
    startTransition(async () => {
      try {
        await updateKpiNodeField(node.id, projectId, field, value);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleAddChild() {
    const node = selectedNode;
    if (!node || !childLevel) return;
    startTransition(async () => {
      try {
        const newId = await createKpiNode(projectId, tenantId, node.id, childLevel);
        onCreated(newId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleDelete() {
    const node = selectedNode;
    if (!node) return;
    if (!confirm("この項目を削除しますか？この操作は取り消せません。")) return;
    if (childCount > 0) {
      show("下位の項目が残っているため削除できません。先に下位の項目を削除してください。", "error");
      return;
    }
    startTransition(async () => {
      try {
        await deleteKpiNode(node.id, projectId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  // フェーズ4：上へ/下へ移動、1段上げる/下げる、複製。いずれも確定済みノードでは
  // メニュー自体を表示しないため（下記JSX）、ここでのnullガードは主に型のため。
  function handleMoveUp() {
    const node = selectedNode;
    if (!node) return;
    startTransition(async () => {
      try {
        await moveKpiNodeUpDown(node.id, projectId, "up");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleMoveDown() {
    const node = selectedNode;
    if (!node) return;
    startTransition(async () => {
      try {
        await moveKpiNodeUpDown(node.id, projectId, "down");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handlePromote() {
    const node = selectedNode;
    if (!node) return;
    startTransition(async () => {
      try {
        await changeKpiNodeLevel(node.id, projectId, "promote");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleDemote() {
    const node = selectedNode;
    if (!node) return;
    startTransition(async () => {
      try {
        await changeKpiNodeLevel(node.id, projectId, "demote");
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  function handleDuplicate() {
    const node = selectedNode;
    if (!node) return;
    startTransition(async () => {
      try {
        const newId = await duplicateKpiNode(node.id, projectId, tenantId);
        onSelect(newId);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  return (
    <div
      data-kpi-detail-node={selectedNode.id}
      className="border border-border rounded-lg bg-page p-6 flex flex-col gap-5"
      style={{ minHeight: 320 }}
    >
      {/* パンくず行 */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-secondary">
        {breadcrumb.map((n) => (
          <span key={n.id} className="flex items-center gap-2">
            <button type="button" onClick={() => onSelect(n.id)} className="hover:text-primary hover:underline cursor-pointer">
              {n.content.text || n.content.level}
            </button>
            <span className="text-faint">›</span>
          </span>
        ))}
        <span
          className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
          style={{ borderColor: "var(--text-primary)", color: "var(--text-primary)" }}
        >
          {selectedNode.content.level}
        </span>
        <StatusBadge status={selectedNode.status} />
        {positionLabel && <span className="font-mono text-[11px] text-faint ml-auto">{positionLabel}</span>}
      </div>

      {/* 本文フィールド：クリックでインライン編集、onBlurで保存。幅は階層に依存しない固定幅。
          確定済み（isItemLocked）の場合は編集不可にする（規約：確定済みの編集経路を残さない。
          サーバー側updateKpiNodeFieldでも同じガードを持たせ二重に防御する） */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">
          {selectedNode.content.level}の内容
        </label>
        <Textarea
          key={`${selectedNode.id}-text`}
          defaultValue={selectedNode.content.text}
          onBlur={(e) => handleFieldBlur("text", e.target.value)}
          rows={3}
          placeholder="内容を入力"
          disabled={locked}
          // kpi_add_goal.md Step1：keyにselectedNode.idを含むため、ノード切替のたびに
          // このTextareaは再マウントされる。autoFocusIdが一致する間だけ、マウント時に
          // ネイティブautoFocusで本文編集にフォーカスを当てる（新規作成直後のみ発火）。
          autoFocus={selectedNode.id === autoFocusId}
          className="text-[15px] leading-relaxed resize-none"
        />
        {!locked && <p className="text-[11px] text-faint">階層が深くても入力幅は一定です。クリックしてそのまま編集できます。</p>}
      </div>

      {/* 付随フィールド：測定指標／担当・期限 */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">測定指標</label>
          <Input
            key={`${selectedNode.id}-metric`}
            defaultValue={selectedNode.content.metric ?? ""}
            onBlur={(e) => handleFieldBlur("metric", e.target.value)}
            placeholder="＋ 未入力"
            disabled={locked}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">担当</label>
          <Input
            key={`${selectedNode.id}-owner`}
            defaultValue={selectedNode.content.owner ?? ""}
            onBlur={(e) => handleFieldBlur("owner", e.target.value)}
            placeholder="＋ 未設定"
            disabled={locked}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">期限</label>
          <Input
            key={`${selectedNode.id}-due`}
            defaultValue={selectedNode.content.due_date ?? ""}
            onBlur={(e) => handleFieldBlur("due_date", e.target.value)}
            placeholder="＋ 未設定"
            disabled={locked}
          />
        </div>
      </div>

      {/* AI候補パネル：選択ノードの1つ下の階層の候補を提案する（確定済みノードでは非表示。
          指示書のやってはいけないこと：確定済みノードにAI候補パネルを表示・操作可能にしない）。
          key={selectedNode.id}でノード切替のたびに候補状態をリセットする */}
      {!locked && (
        <KpiCandidatePanel
          key={selectedNode.id}
          projectId={projectId}
          tenantId={tenantId}
          node={selectedNode}
          onAdopted={(newNodeId) => {
            if (newNodeId) onSelect(newNodeId);
          }}
        />
      )}

      {/* フッター：確定して次へ（未確定時）／確定済み表示（確定済み時）＋「⋯」メニュー */}
      <div className="mt-auto pt-4 border-t border-border flex items-center gap-2">
        {locked ? (
          <span
            className="text-xs px-3 py-1.5 rounded-md"
            style={{ background: "var(--status-confirmed-bg)", color: "var(--status-confirmed-text)" }}
          >
            ✓ 確定済
          </span>
        ) : (
          <Button variant="primary" size="sm" disabled={isPending || confirmPending} onClick={() => onConfirm(selectedNode.id)}>
            確定して次へ
          </Button>
        )}

        <Menu
          trigger={({ onClick }) => (
            <Button variant="secondary" size="sm" onClick={onClick} disabled={isPending}>
              ⋯
            </Button>
          )}
        >
          {childLevel && <MenuItem onClick={handleAddChild}>{childLevel}を追加</MenuItem>}
          {!locked && (
            <>
              <MenuItem onClick={handleMoveUp} disabled={!canMoveUp}>
                上へ移動
              </MenuItem>
              <MenuItem onClick={handleMoveDown} disabled={!canMoveDown}>
                下へ移動
              </MenuItem>
              <MenuItem onClick={handlePromote} disabled={!canPromote}>
                1段上げる
              </MenuItem>
              <MenuItem onClick={handleDemote} disabled={!canDemote}>
                1段下げる
              </MenuItem>
              <MenuItem onClick={handleDuplicate}>複製</MenuItem>
            </>
          )}
          <MenuItem onClick={handleDelete} danger>
            削除
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}
