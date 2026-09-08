# 指示書：「次にやるべきこと」の表示を章タイトルに修正

## 目的

`computeNextAction`の「未着手の章がある」パターンで、`${noItemChapters.length}章で...`という表記が、実際には「該当する章の件数」を表示しているにもかかわらず「章番号」のように読めてしまい紛らわしい。次に開くべき章の**タイトル（章番号+章名）**を明示する表記に修正する。

## 前提確認

- 案件トップ画面の拡充（ステップ表現・ナレッジ集約）が完了していること

---

## Step 1: メッセージ生成ロジックを修正

`src/lib/next-action.ts`を修正する。

```ts
import { CHAPTER_NAMES } from "@/lib/chapters";

// computeNextAction内、該当箇所を修正
const noItemChapters = overview.readiness.filter((r) => r.totalItems === 0);
if (noItemChapters.length > 0) {
  const first = noItemChapters[0];
  const remainingCount = noItemChapters.length - 1;
  return {
    message: `「${first.chapterNo}. ${CHAPTER_NAMES[first.chapterNo]}」でまだ要件項目がありません。AI素案を生成しましょう。${remainingCount > 0 ? `（他${remainingCount}章も未着手）` : ""}`,
    href: `chapters/${first.chapterNo}`,
    linkLabel: "章を開く",
  };
}
```

**注意**：他にも未着手の章が複数ある場合に備え、「他N章も未着手」という補足を残している。1件だけの場合はこの補足自体を表示しない。

## Step 2: 動作確認

1. 複数の章が未着手の案件で案件トップ画面を開き、「次にやるべきこと」に「〈章番号〉. 〈章名〉」の形で最初の未着手章が表示されることを確認する
2. 未着手章が2件以上ある場合、「（他N章も未着手）」の補足が表示されることを確認する
3. 未着手章が1件のみの場合、補足が表示されないことを確認する
4. 「章を開く」ボタンが、表示されている章タイトルと一致する章に遷移することを確認する

## 完了条件

- [ ] メッセージが章タイトルを表示する形に修正済み
- [ ] 動作確認済み
