# 指示書：Phase3 Step2 例外承認ワークフロー

## 目的

未確定項目を「リスク許容で確定扱いとする」操作を可能にし、その理由を記録する。既存の`requirement_items.status`（`exception_approved`）・`exception_reason`列（`docs/02_architecture.md` 2.2節で定義済み）をそのまま使う。詳細は `docs/01_requirements.md` §9（機能No.11）を参照。

## 前提確認

- Phase3 Step1（充足率ダッシュボード）が完了していること
- `requirement_items`の既存UPDATEポリシー（`reqnavi_update`）がそのまま使えるため、新規RLSは不要（案件メンバーであれば誰でもステータス変更できる。承認権限をPMに限定する運用は要件化されていないため、このStepでは全メンバーに開く）

---

## Step 1: 例外承認のServer Actionを作成

`src/actions/requirement-items.ts`に追加する。

```ts
export async function markAsExceptionApproved(
  itemId: string,
  projectId: string,
  chapterNo: number,
  reason: string
) {
  const supabase = await createServerActionClient();
  if (!reason.trim()) throw new Error("理由の入力が必須です");

  const { error } = await supabase
    .from("requirement_items")
    .update({ status: "exception_approved", exception_reason: reason })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/chapters/${chapterNo}`);
}
```

## Step 2: ステータスバッジに例外承認用の表示を追加

`src/components/ui/status-badge.tsx`を修正し、`exception_approved`を独立したバッジとして表示する（Phase1 Step2時点では「確定」に丸めていたが、ここで正式に区別する）。

```ts
type Status = "ai_draft" | "se_reviewing" | "confirmed" | "exception_approved" | "need_hearing";

const STATUS_MAP: Record<Status, { label: string; bg: string; text: string }> = {
  ai_draft:          { label: "AI素案",     bg: "var(--status-draft-bg)",      text: "var(--status-draft-text)" },
  se_reviewing:      { label: "SE確認中",   bg: "var(--status-review-bg)",     text: "var(--status-review-text)" },
  confirmed:         { label: "確定",       bg: "var(--status-confirmed-bg)",  text: "var(--status-confirmed-text)" },
  exception_approved:{ label: "例外承認",   bg: "#EAE6F5",                      text: "#6E5A9E" },
  need_hearing:      { label: "要ヒアリング", bg: "var(--status-needhearing-bg)", text: "var(--status-needhearing-text)" },
};
```

## Step 3: テーブルエディタに例外承認の操作を追加

`src/components/domain/requirement-table/RequirementTable.tsx`を修正する。

1. `exception_approved`を`confirmed`に丸めていた表示を、実際のステータスをそのまま渡す形に変更する。

```tsx
// 修正前: <StatusBadge status={item.status === "exception_approved" ? "confirmed" : item.status} />
// 修正後:
<StatusBadge status={item.status} />
```

2. 理由入力欄と「リスク許容で確定」ボタンの状態管理を追加する。

```tsx
const [exceptionReasonDraft, setExceptionReasonDraft] = useState<Record<string, string>>({});
const [openExceptionFor, setOpenExceptionFor] = useState<string | null>(null);

function handleExceptionApprove(item: RequirementItem) {
  const reason = exceptionReasonDraft[item.id]?.trim();
  if (!reason) return;
  startTransition(() => {
    markAsExceptionApproved(item.id, projectId, chapterNo, reason);
    setOpenExceptionFor(null);
  });
}
```

3. 既存の「確定」ボタンの隣に、例外承認の導線を追加する。

```tsx
{item.status !== "confirmed" && item.status !== "exception_approved" && (
  <>
    <button
      disabled={isPending}
      onClick={() => handleConfirm(item)}
      className="text-xs text-secondary underline"
    >
      確定
    </button>
    {openExceptionFor === item.id ? (
      <div className="flex items-center gap-1">
        <input
          placeholder="リスク許容の理由"
          value={exceptionReasonDraft[item.id] ?? ""}
          onChange={(e) => setExceptionReasonDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
          className="text-xs border border-border rounded px-1 py-0.5 w-32"
        />
        <button
          disabled={isPending || !exceptionReasonDraft[item.id]?.trim()}
          onClick={() => handleExceptionApprove(item)}
          className="text-xs text-[#6E5A9E] underline"
        >
          確定する
        </button>
      </div>
    ) : (
      <button
        disabled={isPending}
        onClick={() => setOpenExceptionFor(item.id)}
        className="text-xs text-faint underline"
      >
        リスク許容で確定
      </button>
    )}
  </>
)}
```

4. `exception_reason`をバッジのツールチップとして表示する。

```tsx
<StatusBadge status={item.status} />
{item.status === "exception_approved" && item.exception_reason && (
  <span title={item.exception_reason} className="text-xs text-faint cursor-help">ⓘ</span>
)}
```

5. content入力欄の`disabled`条件を、`exception_approved`でも編集不可になるよう拡張する。

```tsx
// 修正前: disabled={item.status === "confirmed"}
// 修正後:
disabled={item.status === "confirmed" || item.status === "exception_approved"}
```

`RequirementItem`型（`src/actions/requirement-items.ts`）に`exception_reason: string | null`を追加し、`listRequirementItems`のselect句にも含める。

## Step 4: 充足率ダッシュボードに例外承認を反映

`src/actions/readiness.ts`の`getReadinessSummary`を修正し、例外承認済み項目も「確定扱い」として充足率に含める（意図的にリスクを受容した確定であるため）。

```ts
// 修正前: const confirmedItems = items?.filter((i) => i.status === "confirmed").length ?? 0;
// 修正後:
const confirmedItems = items?.filter((i) => i.status === "confirmed" || i.status === "exception_approved").length ?? 0;
const exceptionApprovedCount = items?.filter((i) => i.status === "exception_approved").length ?? 0;
```

`ChapterReadiness`型に`exceptionApprovedCount: number`を追加し、ダッシュボード画面（`src/app/projects/[id]/readiness/page.tsx`）に列を1つ追加して、通常の確定と区別して表示する（例：充足率の隣に「うち例外承認：n件」を小さく添える）。

```tsx
<span className="text-[10px] text-[#6E5A9E]">
  {s.exceptionApprovedCount > 0 ? `（うち例外承認 ${s.exceptionApprovedCount}件）` : ""}
</span>
```

## Step 5: 動作確認

1. `ai_draft`または`se_reviewing`状態の項目で「リスク許容で確定」をクリックし、理由入力欄が表示されることを確認
2. 理由を空欄のまま「確定する」を押すとボタンが無効化されていて実行できないことを確認
3. 理由を入力して「確定する」を押し、ステータスが「例外承認」バッジ（紫系）に変わることを確認
4. バッジ横の`ⓘ`にマウスオーバーし、入力した理由が表示されることを確認
5. `/projects/{id}/readiness` で、例外承認した項目が充足率の計算に「確定」として含まれ、かつ「うち例外承認n件」の表示が出ることを確認

## やってはいけないこと

- 理由が空欄のまま例外承認できる状態にしない（クライアント側のボタン無効化に加え、Server Action側でも`reason.trim()`のチェックを必ず行う）
- 例外承認後、その項目のcontentを無条件で編集可能なままにしない（Step3の既存ロジックで`confirmed`時のみ`disabled`にしていた入力欄を、`exception_approved`でも同様に`disabled`にする）

## 完了条件

- [ ] `markAsExceptionApproved`実装済み
- [ ] 例外承認バッジ・理由ツールチップが表示されることを確認済み
- [ ] 理由未入力時に実行できないことを確認済み
- [ ] 充足率ダッシュボードに例外承認が反映されることを確認済み
