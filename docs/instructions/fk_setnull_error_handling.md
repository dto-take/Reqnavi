# 指示書：change_requestsのFK方針修正・onClickアクションのエラー表示改善

## 目的

1. `change_requests.item_id`のFK制約を、`item_sources`と同じ自動CASCADEではなく、業務記録として行自体は残す`ON DELETE SET NULL`に変更する
2. `onClick`＋`startTransition`でServer Actionを呼ぶ既存の削除・不採用系アクションに、明示的なエラーハンドリング（トースト表示）を追加し、サイレント失敗（CLAUDE.md規約44）を解消する

## 前提確認

- 不要な章の削除・「不採用」ステータス・行削除が完了していること

---

## Step 1: change_requestsのFK制約を修正

```bash
supabase migration new fix_change_requests_fk
```

```sql
alter table change_requests drop constraint if exists change_requests_item_id_fkey;
alter table change_requests
  add constraint change_requests_item_id_fkey
  foreign key (item_id) references requirement_items(id) on delete set null;
```

`supabase db reset` で反映する。反映後、`docs/02_architecture.md` 2.4節（change_requestsの定義）にこの方針を追記すること。

**注意**：`before_content`/`after_content`にスナップショットが既に格納されているため、`item_id`が`null`になっても変更履歴自体は失われない。`src/app/projects/[id]/changes/page.tsx`等で`item_id`を前提にしたリンク・処理がある場合、`null`のケースを考慮した表示に問題が無いか確認すること。

## Step 2: 削除・不採用系アクションにエラーハンドリングを追加

`src/components/domain/requirement-table/RequirementTable.tsx`の`useToast`を利用し、`markAsRejected`・`deleteRequirementItem`の呼び出しに`try/catch`を追加する。

```tsx
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/error-message";

const { show } = useToast();

function handleReject(item: RequirementItem) {
  startTransition(async () => {
    try {
      await markAsRejected(item.id, projectId, chapterNo);
      show("不採用にしました");
    } catch (e) {
      show(errorMessage(e), "error");
    }
  });
}

function handleDelete(item: RequirementItem) {
  if (!confirm("この項目を削除しますか？この操作は取り消せません。")) return;
  startTransition(async () => {
    try {
      await deleteRequirementItem(item.id, projectId, chapterNo);
      show("削除しました");
    } catch (e) {
      show(errorMessage(e), "error");
    }
  });
}
```

既存の呼び出し箇所（ボタンの`onClick`）を、この`handleReject`・`handleDelete`を呼ぶ形に置き換える。

**注意**：`RequirementTable`はこれまでこのようなエラーハンドリングを行っていなかったため、既存の他の操作（確定・例外承認・Salesforce機能提案・ドラッグ並び替え）も同様のサイレント失敗のリスクを抱えている。今回は削除・不採用の2つに限定して対応するが、`grep -rn "startTransition" src/components/domain/requirement-table`で他の箇所も洗い出し、同じ`try/catch`パターンを適用することを推奨する（範囲が広いため、このStepでは必須とせず、時間があれば対応する形でよい）。

## Step 3: 動作確認

1. `change_requests`が紐づいている項目（変更申請を1件登録した項目）を削除し、成功することを確認する（以前はFK違反で失敗していたはずの状態）
2. 削除後、`change_requests`の該当行が削除されず、`item_id`が`null`になっていることを確認する
3. `/projects/{id}/changes` 画面で、`item_id`が`null`の変更申請が表示上エラーにならないことを確認する
4. 削除・不採用操作を実行し、成功時にトースト通知が表示されることを確認する
5. あえて失敗するケース（例：既に削除済みの項目に対して再度削除を試みる等）を作り、失敗時にエラーのトースト通知が表示されることを確認する（これまでは何も起きなかった状態）

## やってはいけないこと

- `change_requests`の行自体を、`item_id`のNULL化とあわせて削除しない（業務記録として残す）
- エラーハンドリング追加の際、`e instanceof Error`のみで判定しない（規約43、`errorMessage()`ヘルパーを使う）

## 完了条件

- [ ] `change_requests`のFK制約が`ON DELETE SET NULL`に変更済み
- [ ] `docs/02_architecture.md`に追記済み
- [ ] 削除・不採用アクションにトースト通知（成功・失敗両方）実装済み
- [ ] 動作確認済み
