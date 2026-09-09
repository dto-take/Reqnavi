"use client";

import { useState, useTransition } from "react";
import {
  moveItemToGroup,
  reorderGroups,
  bulkConfirm,
  bulkReject,
  bulkSetCategory,
  type ColumnDef,
  type RequirementItem,
} from "@/actions/requirement-items";
import { groupByCategory } from "@/lib/requirement-grouping";
import { RequirementCard } from "@/components/domain/requirement-table/RequirementCard";
import { RequirementGroup } from "@/components/domain/requirement-table/RequirementGroup";
import { BulkActionBar } from "@/components/domain/requirement-table/BulkActionBar";
import { Checkbox, type CheckedState } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";
import { isItemLocked } from "@/lib/item-lock";

// ドラッグされているデータが「カード」なのか「グループ見出し」なのかをdataTransferの
// text/plain値だけで区別できるようにするプレフィックス（区分名に偶然一致する文字列が
// 来ても誤判定しないよう、値そのものではなく明示的なプレフィックスで判別する）。
const ITEM_PREFIX = "item:";
const GROUP_PREFIX = "group:";

export function RequirementTable({
  projectId,
  chapterNo,
  columns,
  items,
  showPlatformSuggestion = false,
}: {
  projectId: string;
  chapterNo: number;
  columns: ColumnDef[];
  items: RequirementItem[];
  showPlatformSuggestion?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [groupDropTarget, setGroupDropTarget] = useState<{ category: string; position: "before" | "after" } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { show } = useToast();

  const groups = groupByCategory(items);

  // --- 選択状態（チェックボックス選択・一括操作バー） ---
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectGroup(groupItemIds: string[]) {
    setSelectedIds((prev) => {
      const allSelected = groupItemIds.every((id) => prev.has(id));
      const next = new Set(prev);
      groupItemIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function toggleSelectAll() {
    const allItemIds = items.map((i) => i.id);
    setSelectedIds((prev) => (prev.size === allItemIds.length ? new Set() : new Set(allItemIds)));
  }

  function selectionStateOf(ids: string[]): CheckedState {
    if (ids.length === 0 || ids.every((id) => !selectedIds.has(id))) return false;
    return ids.every((id) => selectedIds.has(id)) ? true : "indeterminate";
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // 単票の「確定する」「不採用にする」は!isItemLocked(status)の項目にしか出さない
  // （RequirementCard・⋯メニュー参照）。一括操作バーは「全選択」等でロック済み項目も選択集合に
  // 含みうるため、単票操作と矛盾しないよう実行対象をここでも絞り込む（サーバー側のガードと
  // 二重に効かせる。規約29・39と同じ「片方だけに頼らない」考え方）。
  function unlockedSelectedIds(): string[] {
    const byId = new Map(items.map((i) => [i.id, i]));
    return Array.from(selectedIds).filter((id) => {
      const item = byId.get(id);
      return item != null && !isItemLocked(item.status);
    });
  }

  function handleBulkConfirm() {
    const targets = unlockedSelectedIds();
    if (targets.length === 0) {
      show("確定可能な項目が選択されていません", "error");
      return;
    }
    startTransition(async () => {
      try {
        await bulkConfirm(projectId, chapterNo, targets);
        show(`${targets.length}件を確定しました`);
        clearSelection();
      } catch (err) {
        show(errorMessage(err), "error");
      }
    });
  }

  function handleBulkReject() {
    const targets = unlockedSelectedIds();
    if (targets.length === 0) {
      show("不採用にできる項目が選択されていません", "error");
      return;
    }
    startTransition(async () => {
      try {
        await bulkReject(projectId, chapterNo, targets);
        show(`${targets.length}件を不採用にしました`);
        clearSelection();
      } catch (err) {
        show(errorMessage(err), "error");
      }
    });
  }

  function handleBulkSetCategory(category: string) {
    const targets = Array.from(selectedIds);
    if (targets.length === 0) return;
    startTransition(async () => {
      try {
        await bulkSetCategory(projectId, chapterNo, targets, category);
        show(`${targets.length}件を「${category}」に移動しました`);
        clearSelection();
      } catch (err) {
        show(errorMessage(err), "error");
      }
    });
  }

  // --- カードのドラッグ&ドロップ（同一グループ内の並び替え・別グループへの移動の両方） ---
  function handleCardDragStart(e: React.DragEvent, itemId: string) {
    e.dataTransfer.setData("text/plain", `${ITEM_PREFIX}${itemId}`);
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(itemId);
  }

  function handleCardDragOver(e: React.DragEvent, itemId: string) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? "before" : "after";
    setDropTarget({ id: itemId, position });
    setGroupDropTarget(null);
  }

  function handleCardDragEnd() {
    setDraggedId(null);
    setDropTarget(null);
  }

  function handleCardDrop(e: React.DragEvent, targetItemId: string, targetCategory: string) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const position = dropTarget?.position ?? "before";
    setDraggedId(null);
    setDropTarget(null);
    if (!raw.startsWith(ITEM_PREFIX)) return; // グループ見出しのドロップはここでは扱わない
    const sourceId = raw.slice(ITEM_PREFIX.length);
    if (!sourceId || sourceId === targetItemId) return;

    // 章全体のフラットな並びの中で、ドロップ位置の直前に来るべき項目IDを求める
    // （グループ境界は隣接する項目のcategoryによって自然に決まるため、フラット順で
    // 挿入位置さえ正しく指定すれば、結果的に正しいグループへの所属になる）
    const flatIds = items.map((i) => i.id);
    const targetIndex = flatIds.indexOf(targetItemId);
    if (targetIndex === -1) return;
    const insertBeforeItemId = position === "before" ? targetItemId : (flatIds[targetIndex + 1] ?? null);
    if (insertBeforeItemId === sourceId) return;

    startTransition(async () => {
      try {
        await moveItemToGroup(projectId, chapterNo, sourceId, targetCategory, insertBeforeItemId);
      } catch (err) {
        show(errorMessage(err), "error");
      }
    });
  }

  // --- グループ見出し自体のドラッグ&ドロップ（並び替え）＋ カードをグループ見出しへドロップ ---
  function handleGroupDragStart(e: React.DragEvent, category: string) {
    e.dataTransfer.setData("text/plain", `${GROUP_PREFIX}${category}`);
    e.dataTransfer.effectAllowed = "move";
    setDraggedCategory(category);
  }

  function handleGroupDragOver(e: React.DragEvent, category: string) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? "before" : "after";
    setGroupDropTarget({ category, position });
    setDropTarget(null);
  }

  function handleGroupDragEnd() {
    setDraggedCategory(null);
    setGroupDropTarget(null);
  }

  function handleGroupDrop(e: React.DragEvent, targetCategory: string) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const position = groupDropTarget?.position ?? "before";
    setDraggedCategory(null);
    setGroupDropTarget(null);

    if (raw.startsWith(GROUP_PREFIX)) {
      const sourceCategory = raw.slice(GROUP_PREFIX.length);
      if (!sourceCategory || sourceCategory === targetCategory) return;

      const currentOrder = groups.map((g) => g.category);
      const withoutSource = currentOrder.filter((c) => c !== sourceCategory);
      const targetIndex = withoutSource.indexOf(targetCategory);
      if (targetIndex === -1) return;
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const reordered = [...withoutSource];
      reordered.splice(insertIndex, 0, sourceCategory);

      startTransition(async () => {
        try {
          await reorderGroups(projectId, chapterNo, reordered);
        } catch (err) {
          show(errorMessage(err), "error");
        }
      });
      return;
    }

    if (raw.startsWith(ITEM_PREFIX)) {
      // カードをグループ見出しへ直接ドロップした場合は、そのグループの先頭に挿入する
      const sourceId = raw.slice(ITEM_PREFIX.length);
      const targetGroup = groups.find((g) => g.category === targetCategory);
      const insertBeforeItemId = targetGroup?.items[0]?.id ?? null;
      if (!sourceId || insertBeforeItemId === sourceId) return;

      startTransition(async () => {
        try {
          await moveItemToGroup(projectId, chapterNo, sourceId, targetCategory, insertBeforeItemId);
        } catch (err) {
          show(errorMessage(err), "error");
        }
      });
    }
  }

  if (items.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg py-10 text-center">
        <p className="text-sm text-secondary mb-3">まだこの章に項目がありません</p>
        <p className="text-xs text-faint">「AI素案を生成」または「+ 行を追加」から始めてください</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <Checkbox checked={selectionStateOf(items.map((i) => i.id))} onChange={toggleSelectAll} ariaLabel="全件を選択" />
        <span className="text-xs text-secondary">全選択</span>
      </div>

      <BulkActionBar
        count={selectedIds.size}
        categories={groups.map((g) => g.category)}
        pending={isPending}
        onConfirm={handleBulkConfirm}
        onSetCategory={handleBulkSetCategory}
        onReject={handleBulkReject}
        onClear={clearSelection}
      />

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <RequirementGroup
            key={group.category}
            projectId={projectId}
            chapterNo={chapterNo}
            category={group.category}
            items={group.items}
            isDraggingThisGroup={draggedCategory === group.category}
            dropIndicator={groupDropTarget?.category === group.category ? groupDropTarget.position : null}
            onHeaderDragStart={(e) => handleGroupDragStart(e, group.category)}
            onHeaderDragOver={(e) => handleGroupDragOver(e, group.category)}
            onHeaderDragEnd={handleGroupDragEnd}
            onHeaderDrop={(e) => handleGroupDrop(e, group.category)}
            selectionState={selectionStateOf(group.items.map((i) => i.id))}
            onToggleSelectGroup={() => toggleSelectGroup(group.items.map((i) => i.id))}
          >
            {group.items.map((item) => (
              <RequirementCard
                key={item.id}
                item={item}
                columns={columns}
                projectId={projectId}
                chapterNo={chapterNo}
                showPlatformSuggestion={showPlatformSuggestion}
                isDragging={draggedId === item.id}
                dropPosition={dropTarget?.id === item.id ? dropTarget.position : null}
                onDragStart={(e) => handleCardDragStart(e, item.id)}
                onDragOver={(e) => handleCardDragOver(e, item.id)}
                onDragEnd={handleCardDragEnd}
                onDrop={(e) => handleCardDrop(e, item.id, group.category)}
                selected={selectedIds.has(item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
              />
            ))}
          </RequirementGroup>
        ))}
      </div>
    </div>
  );
}
