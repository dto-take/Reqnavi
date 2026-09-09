"use client";

import { Children, useCallback, useReducer, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { updateRequirementItemStatus, type RequirementItem } from "@/actions/requirement-items";
import { Button } from "@/components/ui/button";
import { Checkbox, type CheckedState } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { isItemLocked } from "@/lib/item-lock";
import { errorMessage } from "@/lib/error-message";

function collapseStorageKey(projectId: string, chapterNo: number, category: string): string {
  return `reqnavi:group-collapsed:${projectId}:${chapterNo}:${category}`;
}

// 開閉状態はDBではなくlocalStorageに保存する（ユーザー個人の表示設定であり、
// DBで管理するほどの重要性は無いという指示書の判断）。localStorageの値はサーバー
// 描画時には存在しないため、useSyncExternalStoreのgetServerSnapshot（常にfalse）を
// 使ってサーバー/クライアントの初期描画結果を一致させ、hydrationミスマッチを避ける
// （規約53と同種の考え方）。同一タブ内での書き込みを画面に反映させるための購読先が
// 無いため、subscribeは実質no-op（値の変化はsetCollapsed内のforceRenderで即時反映する）。
const noopSubscribe = () => () => {};

function useCollapsed(projectId: string, chapterNo: number, category: string): [boolean, (v: boolean) => void] {
  const key = collapseStorageKey(projectId, chapterNo, category);
  const [, forceRender] = useReducer((c: number) => c + 1, 0);

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [key]);

  const collapsed = useSyncExternalStore(noopSubscribe, getSnapshot, () => false);

  function setCollapsed(v: boolean) {
    try {
      if (v) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {
      // 保存できなくても表示上の開閉自体は機能させる
    }
    forceRender();
  }

  return [collapsed, setCollapsed];
}

export function RequirementGroup({
  projectId,
  chapterNo,
  category,
  items,
  isDraggingThisGroup,
  dropIndicator,
  onHeaderDragStart,
  onHeaderDragOver,
  onHeaderDragEnd,
  onHeaderDrop,
  selectionState,
  onToggleSelectGroup,
  dragEnabled = true,
  children,
}: {
  projectId: string;
  chapterNo: number;
  category: string;
  items: RequirementItem[];
  isDraggingThisGroup: boolean;
  dropIndicator: "before" | "after" | null;
  onHeaderDragStart: (e: React.DragEvent) => void;
  onHeaderDragOver: (e: React.DragEvent) => void;
  onHeaderDragEnd: () => void;
  onHeaderDrop: (e: React.DragEvent) => void;
  selectionState: CheckedState;
  onToggleSelectGroup: () => void;
  // フェーズ4：グループ軸が「要件区分」以外のときはグループ見出し自体の並び替えも無効化する
  dragEnabled?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCollapsed(projectId, chapterNo, category);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  const unconfirmedCount = items.filter((i) => !isItemLocked(i.status)).length;
  const hasAmbiguous = items.some((i) => i.ambiguous_flags?.length > 0);

  function handleBulkConfirm() {
    const targets = items.filter((i) => !isItemLocked(i.status));
    if (targets.length === 0) return;
    startTransition(async () => {
      try {
        await Promise.all(targets.map((i) => updateRequirementItemStatus(i.id, projectId, chapterNo, "confirmed")));
        show(`${targets.length}件を確定しました`);
      } catch (e) {
        show(errorMessage(e), "error");
      }
    });
  }

  return (
    <div className={`relative flex flex-col gap-2 ${isDraggingThisGroup ? "opacity-40" : ""}`}>
      {dropIndicator && (
        <div
          className={`absolute left-0 right-0 h-0.5 bg-brand pointer-events-none ${
            dropIndicator === "before" ? "-top-1.5" : "-bottom-1.5"
          }`}
        />
      )}

      {/* onDragOver/onDropはヘッダー行のみに付ける（カード側の並び替えドロップと
          イベントバブリングで二重に発火しないよう、外側のラッパーには付けない） */}
      <div
        data-group-header={category}
        className="relative flex items-center gap-2.5 flex-wrap"
        onDragOver={onHeaderDragOver}
        onDrop={onHeaderDrop}
      >
        {dragEnabled && (
          <span
            draggable
            onDragStart={onHeaderDragStart}
            onDragEnd={onHeaderDragEnd}
            className="cursor-grab text-faint flex-none"
            title="ドラッグしてグループを並び替え"
          >
            ⠿
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-faint w-4 flex-none cursor-pointer"
          title={collapsed ? "開く" : "閉じる"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <Checkbox checked={selectionState} onChange={onToggleSelectGroup} ariaLabel={`${category}グループを選択`} />
        <h2 className="text-sm font-semibold text-primary">{category}</h2>
        <span className="font-mono text-[11px] text-faint">{items.length}件</span>
        <span
          className="text-[11px] font-medium px-2.5 py-0.5 rounded-full"
          style={
            unconfirmedCount > 0
              ? { background: "var(--status-review-bg)", color: "var(--status-review-text)" }
              : { background: "var(--status-confirmed-bg)", color: "var(--status-confirmed-text)" }
          }
        >
          {unconfirmedCount > 0 ? `未確定 ${unconfirmedCount}` : "すべて確定"}
        </span>
        {unconfirmedCount > 0 && (
          <Button variant="secondary" size="sm" disabled={isPending} onClick={handleBulkConfirm} className="ml-auto">
            この束を一括確定
          </Button>
        )}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-left border border-dashed border-border rounded-lg px-4 py-3 bg-hover text-xs text-secondary flex items-center gap-3 cursor-pointer"
        >
          <span>{items.length}件を折りたたみ中</span>
          {hasAmbiguous && <span style={{ color: "var(--status-needhearing-text)" }}>曖昧表現を含む</span>}
          <span className="ml-auto text-primary font-medium">開く ▾</span>
        </button>
      ) : Children.count(children) === 0 ? (
        // フィルタチップの絞り込みでこのグループが0件になった場合。見出し自体は残し
        // （やってはいけないこと：見出しを非表示にしない）、カード一覧の代わりにこれを出す。
        // 見出しの件数・未確定N等はitems（フィルタ前の全件）基準のままなので、フィルタ中でも
        // グループ全体としての進捗は読める。
        <div className="border border-dashed border-border rounded-lg px-4 py-3 text-xs text-faint text-center">
          該当する項目がありません
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">{children}</div>
      )}
    </div>
  );
}
