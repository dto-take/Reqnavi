# 指示書：Phase3 Step5 差分管理

## 目的

確定済みベースラインと現在の`requirement_items`を比較し、追加・変更・削除された項目を検出する。検出結果を`change_requests`として登録し、追加見積りの根拠として記録する。詳細は `docs/01_requirements.md` §9（機能No.12）・`docs/02_architecture.md` 2.4節を参照。Phase3の最後のStepとなる。

## スコープの限定

- 現時点で`requirement_items`を削除するUI操作は存在しない（`RequirementTable`に削除ボタンが無い）。そのため「削除」パターンの検出ロジックは実装するが、実際に発生するのは稀（データの直接操作等）である前提とする。
- 変更申請（`change_requests`）の承認・却下ワークフローは対象外とし、**登録と一覧表示のみ**を実装する（承認フローが必要になった場合は別Stepで検討）。

## 前提確認

- Phase3 Step4（ベースライン確定）が完了していること
- `change_requests`のRLSは`docs/02_architecture.md` 4章にSELECT用ポリシー（`estimation_impact_partner_block`）のみ定義されており、INSERT/UPDATE用ポリシーが無い（CLAUDE.md規約16）。このStepで追加する

---

## Step 1: change_requests のINSERT/UPDATEポリシーを整備

```bash
supabase migration new add_change_requests_write_policies
```

```sql
grant select, insert, update, delete on change_requests to authenticated;

create policy "change_requests_insert" on change_requests
  for insert with check (
    is_project_member(project_id)
    and (auth.jwt() ->> 'user_role') != 'partner'
  );

create policy "change_requests_update" on change_requests
  for update using (
    is_project_member(project_id)
    and (auth.jwt() ->> 'user_role') != 'partner'
  );
```

`supabase db reset` で反映する。反映後、`docs/02_architecture.md` 4章に追記すること。テーブル自体の存在・列（`tenant_id`等）もCLAUDE.md規約23に従い確認すること。

## Step 2: 差分検出のServer Actionを作成

新規ファイル `src/actions/change-detection.ts`。

```ts
"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ItemDiff = {
  itemId: string;
  chapterNo: number;
  changeType: "added" | "modified" | "deleted";
  beforeContent: Record<string, string> | null;
  afterContent: Record<string, string> | null;
};

export async function getDiffFromBaseline(projectId: string): Promise<ItemDiff[]> {
  const supabase = await createServerActionClient();

  const { data: baseline } = await supabase
    .from("baseline_snapshots")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (!baseline) return [];

  const { data: snapshots, error: snapError } = await supabase
    .from("baseline_item_snapshots")
    .select("item_id, chapter_no, content")
    .eq("baseline_id", baseline.id);
  if (snapError) throw snapError;

  const { data: currentItems, error: curError } = await supabase
    .from("requirement_items")
    .select("id, chapter_no, content")
    .eq("project_id", projectId);
  if (curError) throw curError;

  const snapshotMap = new Map((snapshots ?? []).map((s) => [s.item_id, s]));
  const currentMap = new Map((currentItems ?? []).map((i) => [i.id, i]));

  const diffs: ItemDiff[] = [];

  for (const [itemId, current] of currentMap) {
    const snapshot = snapshotMap.get(itemId);
    if (!snapshot) {
      diffs.push({ itemId, chapterNo: current.chapter_no, changeType: "added", beforeContent: null, afterContent: current.content });
    } else if (JSON.stringify(snapshot.content) !== JSON.stringify(current.content)) {
      diffs.push({ itemId, chapterNo: current.chapter_no, changeType: "modified", beforeContent: snapshot.content, afterContent: current.content });
    }
  }

  for (const [itemId, snapshot] of snapshotMap) {
    if (!currentMap.has(itemId)) {
      diffs.push({ itemId, chapterNo: snapshot.chapter_no, changeType: "deleted", beforeContent: snapshot.content, afterContent: null });
    }
  }

  return diffs;
}

export async function raiseChangeRequest(projectId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("認証が必要です");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("認証が必要です");

  const { data: baseline } = await supabase
    .from("baseline_snapshots")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();

  const itemId = formData.get("item_id") as string;
  const changeType = formData.get("change_type") as string;
  const beforeContent = formData.get("before_content") as string;
  const afterContent = formData.get("after_content") as string;
  const reason = formData.get("reason") as string;
  const estimationImpact = formData.get("estimation_impact") as string;

  if (!reason.trim()) throw new Error("変更理由の入力が必須です");

  const { error } = await supabase.from("change_requests").insert({
    project_id: projectId,
    tenant_id: tenantId,
    baseline_id: baseline?.id ?? null,
    item_id: itemId,
    change_type: changeType,
    before_content: beforeContent ? JSON.parse(beforeContent) : null,
    after_content: afterContent ? JSON.parse(afterContent) : null,
    reason,
    estimation_impact: estimationImpact || null,
    raised_by: userData.user.id,
    status: "open",
  });
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/changes`);
}

export async function listChangeRequests(projectId: string) {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("change_requests")
    .select("id, item_id, chapter_no, change_type, reason, estimation_impact, status, raised_at")
    .eq("project_id", projectId)
    .order("raised_at", { ascending: false });
  if (error) throw error;
  return data;
}
```

**注意**：`change_requests`テーブルに`chapter_no`列が存在しない場合（`docs/02_architecture.md` 2.4節の定義に含まれていない可能性がある）、Step1のマイグレーションで追加すること（`item_id`から`requirement_items`を辿れば取得できるが、一覧表示の簡潔さのため非正規化して直接持たせる）。

## Step 3: 差分管理画面を作成

新規ファイル `src/app/projects/[id]/changes/page.tsx`。

```tsx
import { getDiffFromBaseline, raiseChangeRequest, listChangeRequests } from "@/actions/change-detection";

const CHANGE_TYPE_LABEL: Record<string, string> = { added: "追加", modified: "変更", deleted: "削除" };

export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [diffs, changeRequests] = await Promise.all([
    getDiffFromBaseline(id),
    listChangeRequests(id),
  ]);
  const raisedItemIds = new Set(changeRequests.map((c) => c.item_id));

  return (
    <div className="max-w-3xl mx-auto mt-10 flex flex-col gap-6">
      <div className="bg-page border border-border rounded-lg p-6">
        <h1 className="text-base font-semibold text-primary mb-1">ベースラインからの差分</h1>
        <p className="text-xs text-secondary mb-4">確定版と現在の内容の差分（{diffs.length}件）</p>

        {diffs.length === 0 ? (
          <p className="text-sm text-secondary">ベースラインからの差分はありません</p>
        ) : (
          <div className="flex flex-col gap-3">
            {diffs.map((d) => (
              <div key={d.itemId} className="border border-border rounded-md p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">
                    {d.chapterNo}章 ／ <span className="text-[#9F6B00]">{CHANGE_TYPE_LABEL[d.changeType]}</span>
                  </span>
                  {raisedItemIds.has(d.itemId) && <span className="text-[10px] text-secondary">申請済み</span>}
                </div>
                {!raisedItemIds.has(d.itemId) && (
                  <form action={raiseChangeRequest.bind(null, id)} className="flex flex-col gap-1.5">
                    <input type="hidden" name="item_id" value={d.itemId} />
                    <input type="hidden" name="change_type" value={d.changeType} />
                    <input type="hidden" name="before_content" value={d.beforeContent ? JSON.stringify(d.beforeContent) : ""} />
                    <input type="hidden" name="after_content" value={d.afterContent ? JSON.stringify(d.afterContent) : ""} />
                    <input name="reason" placeholder="変更理由（必須）" required className="h-8 border border-border rounded-md px-2 text-xs" />
                    <input name="estimation_impact" placeholder="見積りへの影響（任意）" className="h-8 border border-border rounded-md px-2 text-xs" />
                    <button className="h-8 self-start px-3 bg-primary text-white rounded-md text-xs">変更申請として登録</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-page border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-primary mb-3">登録済みの変更申請</h2>
        {changeRequests.length === 0 ? (
          <p className="text-sm text-secondary">まだ変更申請はありません</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {changeRequests.map((c) => (
              <li key={c.id} className="text-sm bg-sidebar rounded-md px-3 py-2">
                <span className="text-xs text-secondary">{c.chapter_no}章／{CHANGE_TYPE_LABEL[c.change_type]}</span>
                <div>{c.reason}</div>
                {c.estimation_impact && <div className="text-xs text-[#AF3D3D]">見積り影響：{c.estimation_impact}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

**注意**：パートナーロールでこの画面を開いた場合、`change_requests`の`estimation_impact`列はRLS（`estimation_impact_partner_block`）によりnullとして返る。画面側で特別な分岐をしなくても、値が無ければ表示されないだけなので、追加の対応は不要。

## Step 4: サイドバーに導線を追加

`src/app/projects/[id]/layout.tsx`に追加する。

```tsx
<Link href={`/projects/${id}/changes`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
  差分管理
</Link>
```

## Step 5: 動作確認

1. ベースライン確定済みの案件で、いずれかの項目の内容を変更する
2. `/projects/{id}/changes` にアクセスし、その項目が「変更」として検出されることを確認
3. 新しく項目を1件追加し、「追加」として検出されることを確認
4. 変更理由を入力せずに「変更申請として登録」を押すと失敗する（Server Action側のチェック）ことを確認
5. 理由を入力して登録し、「登録済みの変更申請」に表示され、対応する差分側には「申請済み」と表示されることを確認
6. パートナーロールでこの画面を開き、`estimation_impact`が表示されないことを確認（他のフィールドは表示されてよい）

## やってはいけないこと

- 差分検出結果を自動的に`change_requests`へ登録しない（SEが確認し、理由を入力して初めて登録される）
- パートナーが変更申請を起票できる状態にしない（Step1のINSERT制限を維持する）

## 完了条件

- [ ] `change_requests`のINSERT/UPDATEポリシー整備済み
- [ ] `docs/02_architecture.md` 4章に追記済み
- [ ] 差分検出（追加・変更）が動作確認済み
- [ ] 変更申請の登録・一覧表示が動作確認済み
- [ ] パートナーへの`estimation_impact`非表示が機能することを確認済み

---

これでPhase3（確定判定ゲート）の全5Stepが完了する。
