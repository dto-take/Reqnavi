# 指示書：ヘルプ・使い方パネル（右下フローティングボタン）

## 目的

画面右下にヘルプボタンを常設し、クリックすると右側からパネルがスライドインして「現在の画面の概要」「FAQ」を表示する機能を追加する。参考UIと同じ構成（検索欄・概要セクション・FAQセクション、それぞれ開閉可能）とする。

## 前提確認

- ボタン操作時の全画面オーバーレイ無効化が完了していること

---

## Step 1: ヘルプコンテンツを定義

新規ファイル `src/lib/help-content.ts`（通常モジュール）。

```ts
export type HelpEntry = { title: string; overview: string };

export const HELP_ENTRIES: { pattern: RegExp; entry: HelpEntry }[] = [
  {
    pattern: /^\/projects$/,
    entry: {
      title: "案件一覧",
      overview: "参加している案件が一覧表示されます。顧客での絞り込み、カード/一覧表示の切替ができます。「+ 新規案件」から案件を作成できます。",
    },
  },
  {
    pattern: /^\/projects\/[^/]+$/,
    entry: {
      title: "案件トップ",
      overview: "案件の充足率・資料件数・ベースライン状況等の概要と、「次にやるべきこと」の提案が表示されます。ステップ一覧から各章に、ナレッジ一覧から最近確定した項目・出典資料にアクセスできます。",
    },
  },
  {
    pattern: /^\/projects\/[^/]+\/chapters\/\d+$/,
    entry: {
      title: "要件定義テーブル",
      overview: "章ごとの要件項目を表形式で編集します。「AI素案を生成」で資料から自動抽出、「+ 行を追加」で手動追加ができます。確定・リスク許容で確定・不採用・削除の操作が各行に用意されています。確定済みの項目は編集できなくなります。",
    },
  },
  {
    pattern: /^\/projects\/[^/]+\/business-flow/,
    entry: {
      title: "業務フロー",
      overview: "As-Is（現状）/To-Be（改善後）の業務フローを、担当者ごとのレーンに分けて管理します。ステップはドラッグで並び替え可能です。資料があれば「AIでステップを生成」も利用できます（ステップが0件の場合のみ）。",
    },
  },
  {
    pattern: /^\/projects\/[^/]+\/readiness$/,
    entry: {
      title: "確定判定ダッシュボード",
      overview: "章ごとの充足率・曖昧表現件数・要ヒアリング件数を確認できます。各行から対応する章へ直接移動できます。",
    },
  },
  {
    pattern: /^\/projects\/[^/]+\/baseline$/,
    entry: {
      title: "ベースライン",
      overview: "その時点の要件定義内容を「確定版」としてスナップショット化します。PM以上の権限が必要です。確定後は差分管理で変更を追跡できます。",
    },
  },
  {
    pattern: /^\/projects\/[^/]+\/changes$/,
    entry: {
      title: "差分管理",
      overview: "確定済みベースラインと現在の内容を比較し、追加・変更・削除された項目を検出します。理由を添えて変更申請として登録できます。",
    },
  },
];

export const GENERAL_FAQS: { q: string; a: string }[] = [
  {
    q: "AI素案が生成されない・資料が見つからないと表示される",
    a: "資料が該当する章のカテゴリに分類されていない可能性があります。「資料」画面で資料の分類タグを確認してください。分類が誤っている場合は資料の再アップロードをお試しください。",
  },
  {
    q: "確定した項目を編集したい",
    a: "確定済み・例外承認済み・不採用の項目は、誤操作防止のため内容を編集できません。修正が必要な場合は、項目を削除して新しく作り直すか、管理者にご相談ください。",
  },
  {
    q: "AI素案を再生成すると前回の内容が消えるのか",
    a: "AI素案（未確認）ステータスの項目のみ新しい内容に置き換わります。確認中・確定・例外承認・不採用にした項目は保持されます。",
  },
  {
    q: "パートナー（協力会社）に見えない項目がある",
    a: "コスト関連項目や組織横断のダッシュボード等、一部の情報はパートナーロールには表示されない設計になっています。",
  },
  {
    q: "章が表示されない・サイドバーに出てこない",
    a: "案件設定の「対象章の管理」で、その章のチェックが外れている可能性があります。管理者・PMが再度チェックを入れることで復元できます。",
  },
];
```

**注意**：ここに列挙したFAQ・概要文言は初期セットである。今後、実際の利用者からの質問傾向に応じて追加・修正していく前提とする。

## Step 2: ヘルプパネルコンポーネントを作成

新規ファイル `src/components/domain/help-panel.tsx`。

```tsx
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { HELP_ENTRIES, GENERAL_FAQS } from "@/lib/help-content";

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
  const pathname = usePathname();

  const matched = HELP_ENTRIES.find((e) => e.pattern.test(pathname));
  const filteredFaqs = GENERAL_FAQS.filter(
    (f) => !search || f.q.includes(search) || f.a.includes(search)
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center shadow-lg z-40 text-xl"
        aria-label="ヘルプ・使い方"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-page/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm bg-page border-l border-border h-full overflow-y-auto p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-primary">ヘルプ・使い方</h2>
              <button onClick={() => setOpen(false)} className="text-secondary text-lg" aria-label="閉じる">
                ×
              </button>
            </div>

            <input
              placeholder="キーワードで検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 border border-border rounded-md px-2 text-sm mb-4"
            />

            {matched && (
              <div className="mb-4 border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setOverviewOpen(!overviewOpen)}
                  className="w-full flex justify-between items-center px-3 py-2 text-sm font-medium text-primary bg-sidebar"
                >
                  概要
                  <span className="text-xs">{overviewOpen ? "▲" : "▼"}</span>
                </button>
                {overviewOpen && (
                  <div className="px-3 py-3 text-xs text-secondary">
                    <div className="font-medium text-primary mb-1">{matched.entry.title}</div>
                    {matched.entry.overview}
                  </div>
                )}
              </div>
            )}

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 text-sm font-medium text-primary bg-sidebar">FAQ</div>
              {filteredFaqs.length === 0 ? (
                <p className="px-3 py-3 text-xs text-faint">該当するFAQが見つかりません</p>
              ) : (
                filteredFaqs.map((faq, i) => (
                  <div key={i} className="border-t border-hover">
                    <button
                      onClick={() => setFaqOpenIndex(faqOpenIndex === i ? null : i)}
                      className="w-full flex justify-between items-center px-3 py-2 text-xs text-left text-primary"
                    >
                      <span>{faq.q}</span>
                      <span className="text-[10px] ml-2 flex-shrink-0">{faqOpenIndex === i ? "▲" : "▼"}</span>
                    </button>
                    {faqOpenIndex === i && (
                      <div className="px-3 pb-3 text-xs text-secondary">{faq.a}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

## Step 3: 全ページに配置

`src/app/layout.tsx`（ルートレイアウト）に追加する。

```tsx
import { HelpPanel } from "@/components/domain/help-panel";

<ToastProvider>
  {children}
  <HelpPanel />
</ToastProvider>
```

**注意**：ログイン画面等、ヘルプが不要なページにも表示されてしまう点が気になる場合は、ルートレイアウトではなく`src/app/projects/layout.tsx`に配置する形に変更してもよい。迷う場合はログイン後の`projects/layout.tsx`側への配置を推奨する。

## Step 4: 動作確認

1. 案件トップ画面等、任意のページの右下にヘルプボタン（？アイコン）が常時表示されることを確認する
2. クリックすると右側からパネルがスライドインし、背景がぼかされることを確認する
3. 案件トップ・章ページ・業務フロー・確定判定ダッシュボード・ベースライン・差分管理のそれぞれで、「概要」セクションの内容がページごとに切り替わることを確認する
4. 「概要」「FAQ」の見出しをクリックすると開閉することを確認する
5. 検索欄にキーワードを入力すると、該当するFAQのみに絞り込まれることを確認する
6. パネル外（背景の暗い部分）をクリックすると閉じることを確認する

## やってはいけないこと

- ヘルプパネルの開閉状態を、ページ遷移のたびに意図せず維持しない
- 検索機能を、外部のライブラリ（全文検索エンジン等）を使った大掛かりな実装にしない

## 完了条件

- [ ] ヘルプコンテンツ定義済み
- [ ] `HelpPanel`実装済み
- [ ] 全ページ（またはログイン後の全ページ）に配置済み
- [ ] ページごとの概要切り替え・FAQ検索・開閉が動作確認済み
