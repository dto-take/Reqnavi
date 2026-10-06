"use client";

import { runAction } from "@/lib/run-action";
import { SavedField } from "@/components/ui/saved-field";
import { useTransition } from "react";
import { updateProgressTaskField, deleteProgressTask, setPredecessor, type ProgressTaskField } from "@/actions/progress-tasks";
import { childrenOf, rollupRange, wouldCreateCycle, type ProgressTask } from "@/lib/gantt/layout";
import { ownerColor } from "@/lib/gantt/owner-color";
import { Input, Select } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ProgressDetailPanel({
  projectId,
  nodes,
  selectedNode,
  memberNames,
  onSelect,
  onAddTask,
}: {
  projectId: string;
  nodes: ProgressTask[];
  selectedNode: ProgressTask | null;
  memberNames: string[];
  onSelect: (id: string) => void;
  onAddTask: (phaseId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  if (!selectedNode) {
    return (
      <div className="flex items-center justify-center text-sm text-faint p-6" style={{ background: "var(--bg-sidebar)" }}>
        左のWBSから項目を選択してください
      </div>
    );
  }

  const isPhase = selectedNode.parent_id === null;
  const parentPhase = selectedNode.parent_id ? nodes.find((n) => n.id === selectedNode.parent_id) ?? null : null;
  const kids = isPhase ? childrenOf(nodes, selectedNode.id) : [];
  const rollup = isPhase ? rollupRange(nodes, selectedNode.id) : null;

  // progress_ux_phase3.md Step3：先行工程の候補は同じ案件内の他の中工程のうち、
  // 選択すると循環参照になるもの（自身の後続チェーンに含まれる工程）を除いたもの。
  const predecessorCandidates = !isPhase
    ? nodes.filter(
        (n) => n.parent_id !== null && n.id !== selectedNode.id && !wouldCreateCycle(nodes, selectedNode.id, n.id)
      )
    : [];
  const predecessorNode = selectedNode.predecessor_id ? nodes.find((n) => n.id === selectedNode.predecessor_id) ?? null : null;

  // 入力欄の保存（SavedFieldのsave）。成功したらtrue、失敗（ok:false・通信断）はfalse（トーストはrunActionが1件出す）
  function saveField(field: ProgressTaskField, value: string): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r = await runAction(() => updateProgressTaskField(selectedNode!.id, projectId, field, value), show);
        resolve(!!r);
      });
    });
  }

  function savePredecessor(value: string): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r = await runAction(() => setPredecessor(selectedNode!.id, projectId, value || null), show);
        resolve(!!r);
      });
    });
  }

  function handleDelete() {
    if (!confirm("この項目を削除しますか？この操作は取り消せません。")) return;
    startTransition(async () => {
      await runAction(() => deleteProgressTask(selectedNode!.id, projectId), show);
    });
  }

  return (
    <div
      data-progress-detail-node={selectedNode.id}
      className="flex flex-col gap-4 p-4"
      style={{ background: "var(--bg-sidebar)" }}
    >
      {/* パンくず・種別ピル */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-secondary">
        {parentPhase && (
          <>
            <button type="button" onClick={() => onSelect(parentPhase.id)} className="hover:text-primary hover:underline cursor-pointer">
              {parentPhase.task_name || "大工程"}
            </button>
            <span className="text-faint">›</span>
          </>
        )}
        <span
          className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
          style={{ borderColor: "var(--text-primary)", color: "var(--text-primary)" }}
        >
          {isPhase ? "大工程" : "中工程"}
        </span>
      </div>

      {/* 名称 */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">名称</label>
        <SavedField id={`${selectedNode.id}-name`} value={selectedNode.task_name} save={(v) => saveField("task_name", v)}>
          {(f) => <Input value={f.value} onChange={(e) => f.onChange(e.target.value)} onBlur={(e) => f.commit(e.target.value)} placeholder="名称を入力" />}
        </SavedField>
      </div>

      {/* 期間 */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">期間</label>
        {isPhase ? (
          <p className="text-sm text-secondary">
            {rollup ? `${rollup.start} 〜 ${rollup.end}` : "中工程が無いため未定"}
            <span className="block text-[11px] text-faint mt-0.5">中工程から自動集計（直接編集はできません）</span>
          </p>
        ) : (
          <div className="flex items-center gap-2">
            {/* 規約58：SavedFieldのkeyに、idと日付そのもの（サーバーの値）を含む。ガントのバードラッグや
                後続工程のカスケードで値が外部から変わったら、強制的に再マウントする */}
            <SavedField id={`${selectedNode.id}-start`} value={selectedNode.week_start ?? ""} save={(v) => saveField("week_start", v)}>
              {(f) => <Input type="date" value={f.value} onChange={(e) => f.onChange(e.target.value)} onBlur={(e) => f.commit(e.target.value)} />}
            </SavedField>
            <span className="text-faint">→</span>
            <SavedField id={`${selectedNode.id}-end`} value={selectedNode.week_end ?? ""} save={(v) => saveField("week_end", v)}>
              {(f) => <Input type="date" value={f.value} onChange={(e) => f.onChange(e.target.value)} onBlur={(e) => f.commit(e.target.value)} />}
            </SavedField>
          </div>
        )}
      </div>

      {/* 担当（中工程のみ） */}
      {!isPhase && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">主担当</label>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: ownerColor(selectedNode.owner_primary) }} />
              <SavedField id={`${selectedNode.id}-owner-primary`} value={selectedNode.owner_primary ?? ""} save={(v) => saveField("owner_primary", v)}>
                {(f) => (
                  <Select
                    value={f.value}
                    onChange={(e) => {
                      f.onChange(e.target.value);
                      f.commit(e.target.value);
                    }}
                    className="flex-1"
                  >
                    <option value="">未設定</option>
                    {memberNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                )}
              </SavedField>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">副担当</label>
            <SavedField id={`${selectedNode.id}-owner-secondary`} value={selectedNode.owner_secondary ?? ""} save={(v) => saveField("owner_secondary", v)}>
              {(f) => (
                <Select
                  value={f.value}
                  onChange={(e) => {
                    f.onChange(e.target.value);
                    f.commit(e.target.value);
                  }}
                >
                  <option value="">未設定</option>
                  {memberNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              )}
            </SavedField>
          </div>
        </div>
      )}

      {/* 先行工程（中工程のみ） */}
      {!isPhase && (
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">先行工程</label>
          <SavedField id={`${selectedNode.id}-predecessor`} value={selectedNode.predecessor_id ?? ""} save={savePredecessor}>
            {(f) => (
              <Select
                value={f.value}
                onChange={(e) => {
                  f.onChange(e.target.value);
                  f.commit(e.target.value);
                }}
              >
                <option value="">なし</option>
                {predecessorCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.task_name || "（未入力）"}
                  </option>
                ))}
              </Select>
            )}
          </SavedField>
          {predecessorNode && (
            <p className="text-[11px] text-faint">
              「{predecessorNode.task_name || "（未入力）"}」の完了後に開始する想定です。ドラッグ・日付変更で先行工程の期間が延びると、この工程の開始日も自動的に繰り下がります。
            </p>
          )}
        </div>
      )}

      {/* 大工程選択時：配下の中工程一覧 */}
      {isPhase && (
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-semibold tracking-wider text-faint uppercase">この大工程の中工程 {kids.length}</label>
          {kids.length === 0 ? (
            <p className="text-xs text-faint">まだ中工程がありません</p>
          ) : (
            <div className="flex flex-col gap-1">
              {kids.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onSelect(k.id)}
                  className="flex items-center gap-2 text-left text-xs px-2.5 py-2 rounded-md border border-border hover:bg-hover cursor-pointer"
                  style={{ background: "#fff" }}
                >
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: ownerColor(k.owner_primary) }} />
                  <span className="flex-1 min-w-0 truncate">{k.task_name || "（未入力）"}</span>
                  <span className="text-faint flex-none">{k.owner_primary || ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* アクションバー */}
      <div className="mt-auto pt-4 border-t border-border flex items-center gap-2">
        {isPhase && (
          <Button variant="primary" size="sm" disabled={isPending} onClick={() => onAddTask(selectedNode.id)}>
            中工程を追加
          </Button>
        )}
        <Menu
          trigger={({ onClick }) => (
            <Button variant="secondary" size="sm" onClick={onClick} disabled={isPending}>
              ⋯
            </Button>
          )}
        >
          <MenuItem onClick={handleDelete} danger>
            削除
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}
