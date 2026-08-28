# 指示書：案件トップ画面（概要・状況・次の作業）

## 目的

案件クリック後の遷移先を、これまでの「メンバー画面」直行から、案件の概要・進捗状況・次にやるべきことが分かる専用のトップ画面に変更する。`docs/01_requirements.md` §9.1で構想していた「次にやるべきことの提案」を、これまで実装済みの各機能のデータを組み合わせて簡易的に実現する。

## 前提確認

- 顧客管理・ユーザ管理・案件一覧の拡張が完了していること

---

## Step 1: 案件概要・次の作業の算出ロジックを作成

新規ファイル `src/actions/project-overview.ts`。

```ts
"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { getReadinessSummary } from "@/actions/readiness";

export async function getProjectOverview(projectId: string) {
  const supabase = await createServerActionClient();

  const { data: project } = await supabase
    .from("projects")
    .select("name, selected_chapters, organizations(name)")
    .eq("id", projectId)
    .single();

  const { count: documentCount } = await supabase
    .from("source_documents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { count: memberCount } = await supabase
    .from("project_members")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data: baseline } = await supabase
    .from("baseline_snapshots")
    .select("version_no, created_at")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();

  const { count: openChangeCount } = await supabase
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "open");

  const readiness = await getReadinessSummary(projectId);
  const avgReadiness = readiness.length > 0
    ? Math.round(readiness.reduce((sum, r) => sum + r.readinessRate, 0) / readiness.length)
    : 0;

  return {
    project,
    documentCount: documentCount ?? 0,
    memberCount: memberCount ?? 0,
    baseline,
    openChangeCount: openChangeCount ?? 0,
    avgReadiness,
    readiness,
  };
}

export type NextAction = { message: string; href: string; linkLabel: string };

export function computeNextAction(overview: Awaited<ReturnType<typeof getProjectOverview>>): NextAction {
  if (overview.documentCount === 0) {
    return { message: "まだ資料がアップロードされていません。まずは資料を格納しましょう。", href: "documents", linkLabel: "資料をアップロードする" };
  }
  const noItemChapters = overview.readiness.filter((r) => r.totalItems === 0);
  if (noItemChapters.length > 0) {
    return { message: `${noItemChapters.length}章でまだ要件項目がありません。AI素案を生成しましょう。`, href: `chapters/${noItemChapters[0].chapterNo}`, linkLabel: "章を開く" };
  }
  if (overview.avgReadiness < 80) {
    return { message: `平均充足率が${overview.avgReadiness}%です。曖昧表現チェック・確定作業を進めましょう。`, href: "readiness", linkLabel: "確定判定ダッシュボードを見る" };
  }
  if (!overview.baseline) {
    return { message: "充足率が高い状態です。ベースラインの確定を検討しましょう。", href: "baseline", linkLabel: "ベースラインを確定する" };
  }
  if (overview.openChangeCount > 0) {
    return { message: `未対応の変更申請が${overview.openChangeCount}件あります。`, href: "changes", linkLabel: "差分管理を確認する" };
  }
  return { message: "現時点で特に対応が必要な項目はありません。", href: "readiness", linkLabel: "確定判定ダッシュボードを見る" };
}
```

**注意**：`computeNextAction`はあくまで簡易的なルールベースの提案であり、精緻な判定ロジックではない。誤った提案が出ても実害が無い設計（気づきの提示に留める、これまでの方針と一貫）にしているため、このStepでは高度化しない。

## Step 2: 案件トップ画面を作成

新規ファイル `src/app/projects/[id]/page.tsx`。

```tsx
import Link from "next/link";
import { getProjectOverview, computeNextAction } from "@/actions/project-overview";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const QUICK_LINKS = [
  { href: "documents", label: "資料" },
  { href: "business-flow", label: "業務フロー" },
  { href: "readiness", label: "確定判定ダッシュボード" },
  { href: "consistency", label: "整合性チェック" },
  { href: "baseline", label: "ベースライン" },
  { href: "changes", label: "差分管理" },
  { href: "members", label: "メンバー" },
];

export default async function ProjectHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const overview = await getProjectOverview(id);
  const nextAction = computeNextAction(overview);

  return (
    <div className="max-w-4xl mx-auto mt-10 flex flex-col gap-4">
      <Card>
        <p className="text-xs text-faint mb-1">{(overview.project?.organizations as unknown as { name: string })?.name}</p>
        <h1 className="text-lg font-semibold text-primary mb-3">{overview.project?.name}</h1>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xl font-semibold text-primary">{overview.avgReadiness}%</div>
            <div className="text-xs text-secondary">平均充足率</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{overview.documentCount}</div>
            <div className="text-xs text-secondary">資料件数</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{overview.memberCount}</div>
            <div className="text-xs text-secondary">メンバー</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{overview.baseline?.version_no ?? "未確定"}</div>
            <div className="text-xs text-secondary">ベースライン</div>
          </div>
        </div>
      </Card>

      <Card className="bg-hover border-brand">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs text-secondary mb-1">次にやるべきこと</div>
            <div className="text-sm text-primary">{nextAction.message}</div>
          </div>
          <Link href={`/projects/${id}/${nextAction.href}`}>
            <Button variant="primary" size="sm">{nextAction.linkLabel}</Button>
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={`/projects/${id}/${link.href}`}>
            <Card className="text-center py-4 hover:bg-hover text-sm text-primary">{link.label}</Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

**注意**：`Card`に`border-brand`クラスを渡しているが、`Card`コンポーネントは現状`className`をそのまま追加合成する実装のはずなので、動作するはずである。もし枠線の色が反映されない場合、`Card`コンポーネントの実装を確認すること。

## Step 3: 遷移先の変更

`src/app/projects/page.tsx`の各案件へのリンク先を、`/projects/${p.id}/members`から`/projects/${p.id}`に変更する（案件一覧のカード表示・一覧表示の両方）。

## Step 4: 動作確認

1. 資料が0件の案件を開き、「次にやるべきこと」に「資料をアップロードしましょう」が表示されることを確認する
2. 資料をアップロードし、いずれかの章にまだ項目が無い状態で再度開き、該当章への誘導が表示されることを確認する
3. 全章に項目があるが充足率が低い案件で、確定判定ダッシュボードへの誘導が表示されることを確認する
4. 充足率が高くベースライン未確定の案件で、ベースライン確定への誘導が表示されることを確認する
5. ベースライン確定済みで、未対応の変更申請がある案件で、差分管理への誘導が表示されることを確認する
6. 案件一覧からクリックすると、メンバー画面ではなくこの新しいトップ画面に遷移することを確認する
7. クイックリンクから各機能に正しく遷移できることを確認する

## やってはいけないこと

- 「次にやるべきこと」の判定を複雑にしすぎない（あくまで簡易なルールベースに留める。これ以上の精緻化が必要になった場合は別Stepで検討する）
- この画面の追加によって、既存の各機能ページへの直接アクセス（URL）が変わらないようにする（トップ画面はあくまで入口の追加であり、既存ページの移動ではない）

## 完了条件

- [ ] `getProjectOverview`・`computeNextAction`実装済み
- [ ] 案件トップ画面実装済み
- [ ] 案件一覧からの遷移先変更済み
- [ ] 各状況パターンでの「次にやるべきこと」表示が動作確認済み
