# 指示書：画面導線整備（ログイン後遷移・案件内サイドバー）

## 目的

機能要件No.16（全体ナビゲーション）のうち、Phase1で作成漏れとなっていた基本導線を整備する。ログイン後の遷移先設定と、案件内の各機能（15章・資料・業務フロー・工数記録・メンバー）への常設サイドバーを実装する。詳細は `docs/01_requirements.md` §9（機能No.16）・§9.1（画面ナビゲーションの考え方）を参照。

## スコープの限定

「次にやるべきことの提案」「章ごとの充足率に応じたステータス表示」等は、Phase3の確定判定ダッシュボードと合わせて実装する（`01_requirements.md` §9.1参照）。**今回は基本的な導線（リンク一覧）の整備のみ**とする。

## 前提確認

- Phase2（Step1〜8、および曖昧フラグ修正）が完了していること

---

## Step 1: ログイン後の遷移先を設定

`src/app/page.tsx` を以下に書き換える。

```tsx
import { redirect } from "next/navigation";
import { createServerActionClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createServerActionClient();
  const { data } = await supabase.auth.getUser();
  redirect(data.user ? "/projects" : "/login");
}
```

`src/actions/auth.ts`の`signInWithPassword`・`signInWithGoogle`（Phase0 Step1）のログイン成功後のリダイレクト先が`/`になっている場合、これで自動的に`/projects`へ再遷移される。念のため、既存コードのリダイレクト先を確認し、`/`のままであることを確認する（`/projects`に直接変更しても良いが、今回のルートページ経由でも成立するため必須ではない）。

## Step 2: 案件内の共通サイドバー用レイアウトを作成

新規ファイル `src/app/projects/[id]/layout.tsx`。**このレイアウトは`src/app/projects/[id]/`配下の全ページ（メンバー・章別ページ・資料・業務フロー・工数記録）に自動的に適用される**（Next.js App Routerのネストレイアウトの仕組みによる。個別ページ側に手を加える必要はない）。

```tsx
import Link from "next/link";
import { createServerActionClient } from "@/lib/supabase/server";

const CHAPTER_NAMES: Record<number, string> = {
  1: "お客様概要", 2: "プロジェクトの目的", 3: "ロードマップ", 4: "KPI",
  5: "システム要件", 6: "開発スコープ", 7: "ビジネス要件", 8: "業務要件",
  9: "機能要件", 10: "非機能要件", 11: "データ移行要件", 12: "トレーニング要件",
  13: "システム運用要件", 14: "システム定着化支援要件", 15: "進捗",
};

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerActionClient();
  const { data: project } = await supabase
    .from("projects")
    .select("name, selected_chapters")
    .eq("id", id)
    .single();

  const selectedChapters = ((project?.selected_chapters as number[]) ?? []).sort((a, b) => a - b);

  return (
    <div className="flex min-h-screen">
      <nav className="w-56 bg-sidebar border-r border-border p-4 flex-shrink-0">
        <Link href="/projects" className="text-xs text-secondary underline mb-4 block">
          ← 案件一覧
        </Link>
        <div className="text-sm font-semibold text-primary mb-4 truncate">{project?.name}</div>

        <div className="text-[11px] text-faint mb-1 mt-3">要件定義</div>
        <div className="flex flex-col gap-0.5 mb-4">
          {selectedChapters.map((n) => (
            <Link
              key={n}
              href={`/projects/${id}/chapters/${n}`}
              className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1"
            >
              {n}. {CHAPTER_NAMES[n]}
            </Link>
          ))}
        </div>

        <div className="text-[11px] text-faint mb-1">関連機能</div>
        <div className="flex flex-col gap-0.5">
          <Link href={`/projects/${id}/documents`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
            資料
          </Link>
          <Link href={`/projects/${id}/business-flow`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
            業務フロー
          </Link>
          <Link href={`/projects/${id}/effort`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
            工数記録
          </Link>
          <Link href={`/projects/${id}/members`} className="text-sm text-secondary hover:text-primary hover:bg-hover rounded px-2 py-1">
            メンバー
          </Link>
        </div>
      </nav>

      <main className="flex-1 overflow-x-auto">{children}</main>
    </div>
  );
}
```

**注意**：4章（KPI）・9章（機能要件、画面遷移図・画面イメージのサブリンクを含む）・10章（非機能要件）・15章（進捗）は固定ルート（CLAUDE.md規約19）なので、上記の`/chapters/${n}`というリンクの形で問題なく到達できる（`[chapterNo]`動的ルートより固定ルートが優先されるため）。

各ページ（`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`等）側の`max-w-*`によるページ中央寄せのレイアウトは、このサイドバー導入によって見た目が多少変わる可能性がある（サイドバー分の幅が引かれるため）。大きく崩れる場合は、各ページの`max-w-*`指定を調整すること。

## Step 3: 案件一覧画面からのリンク先を確認

`src/app/projects/page.tsx`（Phase0 Step3）で、各案件行のリンク先が`/projects/${p.id}`になっている場合、これは`[chapterNo]`等の配下ページではないため404になる。リンク先を、案件を開いたときに最初に表示すべきページ（例：`/projects/${p.id}/members`、または`/projects/${p.id}/chapters/1`）に変更する。

## Step 4: 動作確認

1. ログイン後、自動的に`/projects`（案件一覧）に遷移することを確認
2. 案件一覧から1件クリックし、左サイドバーが表示された状態で該当ページに遷移することを確認
3. サイドバーから「資料」「業務フロー」「工数記録」「メンバー」、および複数の章（4章・9章・10章・15章を含む）にクリックで遷移できることを確認
4. サイドバーの「← 案件一覧」から案件一覧に戻れることを確認
5. `selected_chapters`に含まれていない章が、サイドバーに表示されないことを確認

## やってはいけないこと

- 章ごとの進捗ステータス表示（バッジ等）や「次にやるべきこと」の提示をこのStepで作り込まない（Phase3で対応する）
- サイドバーをクライアントコンポーネント化して不要な複雑さを増やさない（現時点ではリンク一覧のみのため、Server Componentのままで十分）

## 完了条件

- [ ] ログイン後、`/projects`に自動遷移することを確認済み
- [ ] 案件内の全ページに共通サイドバーが表示され、各機能に遷移できることを確認済み
- [ ] 案件一覧からのリンク先が正しいページに向いていることを確認済み
