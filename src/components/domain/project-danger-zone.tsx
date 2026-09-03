"use client";

import { useState } from "react";
import { deleteProject } from "@/actions/projects";
import { Input } from "@/components/ui/input";

export function ProjectDangerZone({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [inputValue, setInputValue] = useState("");
  const canDelete = inputValue === projectName;

  return (
    <div className="border border-(--status-needhearing-text) rounded-lg p-4 mt-6">
      <h2 className="text-sm font-semibold text-(--status-needhearing-text) mb-1">危険な操作</h2>
      <p className="text-xs text-secondary mb-3">
        この案件と、紐づく全てのデータ（要件項目・資料・業務フロー・進捗記録・ベースライン・変更申請等）が完全に削除されます。この操作は取り消せません。
      </p>
      <form action={deleteProject.bind(null, projectId)} className="flex flex-col gap-2">
        <label className="text-xs text-secondary">
          削除するには、案件名「{projectName}」を正確に入力してください
        </label>
        <Input
          name="confirm_name"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-full"
        />
        <button
          type="submit"
          disabled={!canDelete}
          onClick={(e) => {
            if (!confirm("本当にこの案件を削除しますか？この操作は取り消せません。")) e.preventDefault();
          }}
          className="h-9 px-4 bg-(--status-needhearing-text) text-white rounded-md text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed w-fit"
        >
          この案件を完全に削除する
        </button>
      </form>
    </div>
  );
}
