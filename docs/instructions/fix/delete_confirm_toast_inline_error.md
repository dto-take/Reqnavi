# 指示書：削除確認・成功通知・インラインエラー・空状態案内

## 目的

1. 削除操作に確認ダイアログを追加する（データ消失防止、最優先）
2. 主要な操作の成功をトースト通知で伝える
3. バリデーションエラーを、画面全体のエラー表示（`error.tsx`）ではなく、入力欄付近のインライン表示に変更する
4. 案件が0件の場合の案内を追加する

## スコープの限定

2・3は影響範囲が広いため、**このStepでは主要な操作にのみ適用し、全操作への展開は範囲外とする**（他の操作へは、同じパターンを踏襲して段階的に拡張していく前提）。

## 前提確認

- UX改善6項目（サイドバー折りたたみ等）が完了していること

---

## Step 1: 削除確認ダイアログを追加（最優先）

新規ファイル `src/components/ui/confirm-delete-button.tsx`。

```tsx
"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { ButtonHTMLAttributes } from "react";

export function ConfirmDeleteButton({
  confirmMessage = "本当に削除しますか？この操作は取り消せません。",
  children = "削除",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmMessage?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
      className={className}
      {...props}
    >
      {pending ? "削除中..." : children}
    </Button>
  );
}
```

以下の`<form action={deleteX...}>`内の削除ボタンを、この`ConfirmDeleteButton`に置き換える（`grep -rn "delete.*Flow\|deleteEffortLog\|deleteScreenNode\|deleteKpiNode\|deleteProgressTask"`等で該当箇所を洗い出す）。

- 工数記録削除（`deleteEffortLog`）
- 業務フローステップ削除（`deleteFlowStep`）
- 画面遷移ノード削除（`deleteScreenNode`）
- 進捗タスク削除（`deleteProgressTask`、実装されていれば）

`KpiTree.tsx`の`deleteKpiNode`は`<form>`ではなくonClick+`startTransition`のため、別途以下のように直接`confirm()`を挟む。

```tsx
<button
  disabled={isPending}
  onClick={() => {
    if (confirm("本当に削除しますか？この操作は取り消せません。")) {
      startTransition(() => deleteKpiNode(node.id, projectId));
    }
  }}
  className="text-xs text-faint"
>
  削除
</button>
```

## Step 2: 主要な操作にトースト通知を追加

新規ファイル `src/components/ui/toast.tsx`。

```tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastItem = { id: number; message: string; type: "success" | "error" };
type ToastContextValue = { show: (message: string, type?: "success" | "error") => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded-md text-sm text-white shadow-md ${t.type === "success" ? "bg-brand" : "bg-[#A23B2E]"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastはToastProviderの内側で使用すること");
  return ctx;
}
```

`src/app/layout.tsx`（ルートレイアウト）で全体を`ToastProvider`でラップする。

```tsx
import { ToastProvider } from "@/components/ui/toast";
// ...
<body>
  <ToastProvider>{children}</ToastProvider>
</body>
```

**このStepで通知対象とする操作**（いずれも既にonClick+`startTransition`のクライアント側実装のため、`await`後に`show()`を呼ぶだけで追加できる）：

- 項目の確定（`handleConfirm`） → `show("確定しました")`
- 例外承認（`handleExceptionApprove`） → `show("リスク許容で確定しました")`
- Salesforce機能提案（`handleSuggest`） → `show("提案を反映しました")`
- ドラッグ&ドロップでの並び替え（`handleDrop`） → `show("順序を更新しました")`
- AI素案生成完了（`AiGenerateButton`または呼び出し元） → `show("AI素案を生成しました")`

`RequirementTable.tsx`・`KpiTree.tsx`・`AiGenerateButton.tsx`（または呼び出し元）で`useToast()`を呼び出し、各ハンドラの`await`完了後に`show(...)`を追加する。

**注意（スコープの限定）**：`<form action={...}>`ベースの操作（案件作成・ベースライン確定・工数記録追加等）へのトースト適用は、`useActionState`による戻り値のハンドリングが必要になり本Stepの範囲を超えるため、今回は対象外とする。将来的に対応する場合は、対象のactionを`{ ok: boolean, message: string }`を返す形に変更し、`useActionState`でラップしたクライアントコンポーネント経由で呼び出す構成に変更する。

## Step 3: 主要な検証エラーをインライン表示に変更

新規ファイル `src/components/ui/inline-error-form.tsx`（`useActionState`を使った汎用ラッパー）。

```tsx
"use client";

import { useActionState } from "react";

type ActionResult = { error: string | null };

export function InlineErrorForm({
  action,
  children,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, { error: null });
  return (
    <form action={formAction}>
      {children}
      {state.error && <p className="text-xs text-[#A23B2E] mt-1">{state.error}</p>}
    </form>
  );
}
```

**このStepで対象とする操作**（バリデーションエラーがサーバー側でしか検知できない、かつ現状は例外がそのまま`error.tsx`に到達するもの）：

- 工数記録の追加（`createEffortLog`：終了日が開始日より前だとDB制約エラーになる）
- パートナーアカウント発行（`createPartnerAccount`：メール重複時のエラー等）

対象のServer Actionを、`ActionResult`を返す形に修正する（例：`createEffortLog`）。

```ts
export async function createEffortLog(
  projectId: string,
  tenantId: string,
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    // 既存のロジック（バリデーション・insert）
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "エラーが発生しました" };
  }
}
```

呼び出し元のページで`<form action={addLog}>`を`<InlineErrorForm action={addLog}>`に置き換える。

**注意**：Server Actionのシグネチャが変わる（`prevState`引数が増える）ため、`.bind(null, projectId, tenantId)`のような部分適用をしている箇所は、`useActionState`が要求する形（第一引数が`prevState`）に合わせて引数の順序を調整すること。

## Step 4: 案件0件時の案内を追加

`src/app/projects/page.tsx`に、案件が0件の場合の分岐を追加する。

```tsx
{projects.length === 0 ? (
  <div className="text-center py-16">
    <p className="text-sm text-secondary mb-3">まだ案件がありません</p>
    <Link href="/projects/new"><Button variant="primary" size="sm">+ 新規案件を作成する</Button></Link>
  </div>
) : (
  // 既存のカード/一覧表示
)}
```

## Step 5: 動作確認

1. 工数記録・業務フローステップ・画面遷移ノード・KPIノードの削除で、確認ダイアログが表示され、キャンセルすると削除されないことを確認する
2. 項目の確定・例外承認・Salesforce提案・ドラッグ並び替え・AI素案生成のいずれかを実行し、右下にトースト通知が表示されることを確認する
3. 工数記録で終了日を開始日より前に設定して送信し、画面全体がエラー表示にならず、フォーム内にエラー文言が表示されることを確認する
4. 案件が0件の状態（新規admin/PMアカウント等）で案件一覧を開き、案内メッセージが表示されることを確認する

## やってはいけないこと

- Step2・3の対象外の操作（案件作成・ベースライン確定等）まで無理に今回の範囲に含めない。範囲外であることをコードコメントに残し、次回以降の拡張に委ねる
- 削除確認ダイアログを、ブラウザ標準の`confirm()`以外の複雑なモーダル実装に発展させない（このStepでは`confirm()`で十分とする）

## 完了条件

- [ ] 主要な削除操作すべてに確認ダイアログ実装済み
- [ ] 指定した5操作にトースト通知実装済み
- [ ] 工数記録・パートナー発行のインラインエラー表示実装済み
- [ ] 案件0件時の案内実装済み
- [ ] 動作確認済み
