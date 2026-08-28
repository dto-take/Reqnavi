# 指示書：エラー画面の整備（AI呼び出し失敗時を含む）

## 目的

Gemini APIのクォータ超過等でエラーが発生した際、Next.jsの開発用エラーオーバーレイ（生のスタックトレース・APIレスポンスのJSON）がそのまま表示されるのではなく、利用者向けの分かりやすいエラー画面を表示する。

## 前提確認

- 直近でGemini APIのクォータ超過エラーが発生していること（動作確認の材料として使える）

---

## Step 1: AI呼び出し共通のエラーラッパーを作成

新規ファイル `src/lib/ai/gemini-error.ts`（通常モジュール）。

```ts
export class AiCallError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "AiCallError";
  }
}

// Gemini API呼び出しをラップし、エラー内容を利用者向けの文言に変換する
export async function callGeminiSafely<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || message.includes("quota")) {
      throw new AiCallError(
        "AI機能の利用上限に達しています。しばらく時間を置いてから再度お試しください。",
        err
      );
    }
    if (message.includes("401") || message.includes("403") || message.includes("API_KEY_INVALID")) {
      throw new AiCallError("AI機能の認証に失敗しました。管理者に確認してください。", err);
    }
    throw new AiCallError("AI機能の呼び出し中にエラーが発生しました。時間を置いて再度お試しください。", err);
  }
}
```

## Step 2: 既存のGemini呼び出し箇所をラッパー経由に変更

以下の各ファイルで、`ai.models.generateContent(...)`の呼び出し部分を`callGeminiSafely(() => ai.models.generateContent({...}))`で包む。

- `src/actions/ai-draft.ts`（`generateDraft`）
- `src/lib/ai/classify-document.ts`（`classifyDocument`）
- `src/actions/ambiguous-check.ts`（`runAmbiguousCheckAI`）
- `src/actions/platform-suggestion.ts`（`suggestPlatformFeature`）

```ts
// 修正例（generateDraft内）
import { callGeminiSafely } from "@/lib/ai/gemini-error";
// ...
const response = await callGeminiSafely(() =>
  ai.models.generateContent({ model: "gemini-2.5-flash", contents: filledPrompt, config: { /* 既存のまま */ } })
);
```

**注意**：既存コードで使用しているモデル名（`gemini-2.0-flash`か`gemini-2.5-flash`か）は、各ファイルの実装済みの値をそのまま維持すること（本指示書で変更しない）。

## Step 3: エラー画面（error.tsx）を作成

Next.js App Routerの規約に従い、案件配下のエラーをまとめて捕捉するバウンダリを作成する。新規ファイル `src/app/projects/[id]/error.tsx`。

```tsx
"use client";

export default function ProjectErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isAiError = error.name === "AiCallError";

  return (
    <div className="max-w-md mx-auto mt-20 bg-page border border-border rounded-lg p-6 text-center">
      <div className="text-sm font-medium text-primary mb-2">
        {isAiError ? "AI機能でエラーが発生しました" : "エラーが発生しました"}
      </div>
      <p className="text-sm text-secondary mb-4">
        {isAiError ? error.message : "予期しないエラーが発生しました。しばらく時間を置いて再度お試しください。"}
      </p>
      <button
        onClick={reset}
        className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium"
      >
        再試行
      </button>
    </div>
  );
}
```

**注意**：`error.tsx`は`"use client"`が必須（Next.jsの規約）。Server Action内で投げたエラーが、この`error.tsx`によって捕捉されることを動作確認で確認する（Server Actionのエラーは、呼び出し元のページの再レンダリング時に最も近い`error.tsx`境界に伝播する）。

## Step 4: ルート全体用のフォールバックも用意

`src/app/projects/[id]/`配下以外（ログイン画面等）でのエラーにも備え、アプリ全体のフォールバックを作成する。新規ファイル `src/app/error.tsx`（Step3と同様の内容で、案件に依存しない文言にする）。

```tsx
"use client";

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-md mx-auto mt-20 bg-page border border-border rounded-lg p-6 text-center">
      <div className="text-sm font-medium text-primary mb-2">エラーが発生しました</div>
      <p className="text-sm text-secondary mb-4">
        {error.name === "AiCallError" ? error.message : "予期しないエラーが発生しました。しばらく時間を置いて再度お試しください。"}
      </p>
      <button onClick={reset} className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium">
        再試行
      </button>
    </div>
  );
}
```

## Step 5: 動作確認

1. Gemini APIのクォータが枯渇している状態（または一時的にAPIキーを無効な値に変更した状態）で、AI素案生成を実行する
2. Next.jsの生のスタックトレース画面ではなく、Step3で作った「AI機能でエラーが発生しました」画面が表示されることを確認
3. 表示されるメッセージが、生のJSON（`{"error":{"code":429,...`）ではなく「AI機能の利用上限に達しています。しばらく時間を置いてから再度お試しください。」等の分かりやすい文言になっていることを確認
4. 「再試行」ボタンを押すと、エラー前のページに戻ることを確認
5. AI呼び出しを伴わない一般的なエラー（例：存在しないIDへのアクセス）でも、同じエラー画面（ただし文言は汎用的なもの）が表示されることを確認

## やってはいけないこと

- エラー内容（APIキーの値、内部的なスタックトレース詳細等）を利用者向け画面にそのまま表示しない
- `error.tsx`内で複雑なロジックを持たせない（あくまで表示とリトライボタンに留める）

## 完了条件

- [ ] `callGeminiSafely`実装済み、既存4箇所のAI呼び出しに適用済み
- [ ] `src/app/projects/[id]/error.tsx`・`src/app/error.tsx`作成済み
- [ ] クォータ超過エラー等で、分かりやすいエラー画面が表示されることを確認済み
