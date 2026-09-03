# 指示書：案件（プロジェクト）自体の削除機能

## 目的

案件を丸ごと削除できるようにする。関連する全データ（要件項目・資料・業務フロー・進捗・ベースライン・変更申請等、ほぼ全テーブル）が連鎖的に削除されるため、極めて破壊的な操作として慎重に扱う。

## 設計方針

- **削除権限はadminのみ**（pmを含む他ロールには許可しない。他の破壊的操作より一段階厳しくする）
- **確認は`confirm()`では不十分**とし、「案件名を正確に入力しないと削除ボタンが押せない」形式にする
- **DB上のカスケード削除（`ON DELETE CASCADE`）に加え、Supabase Storage上のファイルも別途削除する**（Storageの削除はDBの外部キーの対象外のため、明示的な処理が必要）

## 前提確認

- 資料形式の拡張（PDF・Word・Excel・PowerPoint対応）が完了していること

---

## Step 1: projectsを参照する全テーブルを洗い出す

**手作業でのリストアップは信用せず、必ずgrepで確認する**（規約36・37の教訓）。

```bash
grep -rln "references projects(id)\|references projects (id)" supabase/migrations/
```

見つかった各マイグレーションファイルから、`project_id`の外部キー制約名を確認する。Supabase Studioの「Database → Tables」→ 各テーブルの「Foreign Keys」からも確認できる。

## Step 2: 全FK制約にON DELETE CASCADEを追加

```bash
supabase migration new add_project_cascade_delete
```

Step1で洗い出した全テーブルについて、以下のパターンで制約を張り替える（テーブル名・制約名は実際の環境に合わせて置き換える）。

```sql
-- 例：requirement_items の場合
alter table requirement_items drop constraint if exists requirement_items_project_id_fkey;
alter table requirement_items add constraint requirement_items_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

-- 以下、Step1で見つかった全テーブルについて同様に繰り返す
-- （想定：source_documents, flow_nodes, progress_tasks, effort_logs,
--   baseline_snapshots, change_requests, project_members,
--   ai_interactions 等）
```

**注意**：制約名が`テーブル名_project_id_fkey`という命名規則になっていない場合があるため、`drop constraint if exists`だけでなく、実際の制約名をStudioやSQL（`select conname from pg_constraint where conrelid = 'テーブル名'::regclass`）で確認してから記述すること。

## Step 3: Storage上のファイルを削除するServer Actionを作成

`src/actions/projects.ts`に追加する。

```ts
export async function deleteProject(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.user_role !== "admin") {
    throw new Error("この操作には管理者権限が必要です");
  }

  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();
  if (fetchError || !project) throw new Error("案件が見つかりません");

  const confirmName = formData.get("confirm_name") as string;
  if (confirmName !== project.name) {
    throw new Error("入力された案件名が一致しません");
  }

  const { data: files } = await supabase.storage
    .from("project-documents")
    .list(`${projectId}/uploads`);
  if (files && files.length > 0) {
    const paths = files.map((f) => `${projectId}/uploads/${f.name}`);
    await supabase.storage.from("project-documents").remove(paths);
  }

  const { error: deleteError } = await supabase.from("projects").delete().eq("id", projectId);
  if (deleteError) throw deleteError;

  redirect("/projects");
}
```

**注意**：`storage.list()`はデフォルトで最大100件までしか返さない場合がある。資料が100件を超える案件がある場合はページネーションを考慮すること（現時点の運用規模ではまず問題にならないと想定するが、コードにコメントで残しておく）。

## Step 4: 削除UI（案件設定の「危険な操作」セクション）を作成

新規ファイル `src/components/domain/project-danger-zone.tsx`。

```tsx
"use client";

import { useState } from "react";
import { deleteProject } from "@/actions/projects";
import { Input } from "@/components/ui/input";

export function ProjectDangerZone({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [inputValue, setInputValue] = useState("");
  const canDelete = inputValue === projectName;

  return (
    <div className="border border-[#A23B2E] rounded-lg p-4 mt-6">
      <h2 className="text-sm font-semibold text-[#A23B2E] mb-1">危険な操作</h2>
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
          className="h-9 px-4 bg-[#A23B2E] text-white rounded-md text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed w-fit"
        >
          この案件を完全に削除する
        </button>
      </form>
    </div>
  );
}
```

`settings/page.tsx`で、admin権限の場合のみこのコンポーネントを表示する。

```tsx
{canEdit && claims?.claims?.user_role === "admin" && (
  <ProjectDangerZone projectId={id} projectName={project?.name ?? ""} />
)}
```

## Step 5: 動作確認

1. admin以外（pm等）でログインし、案件設定画面に「危険な操作」セクションが表示されないことを確認する
2. admin権限で案件設定画面を開き、「危険な操作」セクションが表示されることを確認する
3. 案件名を誤って入力した状態では削除ボタンが押せない（disabled）ことを確認する
4. 正しい案件名を入力すると削除ボタンが有効になることを確認する
5. テスト用の使い捨て案件（重要なデータが無いもの）で実際に削除を実行し、`confirm()`ダイアログを経て削除が完了することを確認する
6. 削除後、`/projects`に自動的にリダイレクトされることを確認する
7. Supabase Studioで、削除した案件に紐づいていた`requirement_items`・`source_documents`等が全て連鎖的に削除されていることを確認する
8. Storageバケットで、該当案件のフォルダ（アップロードした資料ファイル）が削除されていることを確認する

## やってはいけないこと

- 本番相当のデータが入った案件で、動作確認のために実際に削除を実行しない（必ずテスト用の使い捨て案件で確認する）
- `ON DELETE CASCADE`の対象テーブルの洗い出しを、指示書に列挙した想定リストだけで済ませない（Step1のgrep確認を必ず行う）
- 確認方法を`confirm()`のみに頼らない（案件名の入力一致チェックを必ず実装する）

## 完了条件

- [ ] 全関連テーブルのFK制約をON DELETE CASCADEに変更済み（grep確認込み）
- [ ] `deleteProject`（admin限定・案件名一致チェック・Storage削除込み）実装済み
- [ ] 「危険な操作」UI実装済み
- [ ] テスト用案件での削除確認済み（DB・Storage双方の連鎖削除を確認）
