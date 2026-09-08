# 指示書：Phase2 Step5 画面ワイヤーフレーム生成

## 目的

機能要件（9章・テンプレートC）の項目から、ローファイ（箱と文字だけ）の画面ワイヤーフレームを自動生成する。詳細は `docs/01_requirements.md` §9（機能No.6）を参照。

## スコープの限定（重要）

画面パターンは複数種類（一覧・詳細・入力フォーム・ダッシュボード等）想定されるが、**このStepでは「一覧画面」パターンのみ対応する**。他パターンはStep6以降で拡張する（これまでのテンプレート横展開と同じ、段階的に進める方針）。

## 前提確認

- Phase2 Step4（As-Is/To-Be差分検出）が完了していること

---

## Step 1: テンプレートCに画面情報用の列を追加

```bash
supabase migration new seed_screen_columns
```

```sql
-- 画面を表す機能要件のみで使う列。それ以外の機能要件・他章（6,8,12）では空欄のままでよい
-- （これまでの「章によっては使わない列がある」方針を踏襲、CLAUDE.mdの設計思想と一貫）
insert into chapter_column_templates (template_type, column_key, label, data_type, order_index) values
  ('C', 'screen_pattern', '画面パターン（一覧/詳細/入力フォーム/ダッシュボード）', 'text', 6),
  ('C', 'screen_fields',  '表示項目（カンマ区切り）', 'text', 7),
  ('C', 'screen_actions', '操作（カンマ区切り）', 'text', 8)
on conflict (template_type, column_key) do nothing;
```

`supabase db reset` で反映する。

## Step 2: ワイヤーフレーム描画コンポーネントを作成

新規ファイル `src/components/domain/screen-wireframe/ScreenWireframe.tsx`。デザイントークン（Phase0 Step1）に準拠する。

```tsx
export function ScreenWireframe({
  screenName,
  pattern,
  fields,
  actions,
}: {
  screenName: string;
  pattern: string;
  fields: string[];
  actions: string[];
}) {
  if (pattern.trim() !== "一覧") {
    return (
      <div className="text-xs text-secondary p-3 border border-dashed border-border rounded-md">
        「{pattern || "未設定"}」パターンは現時点で未対応です（一覧画面のみ対応）
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4 bg-page max-w-xl">
      <div className="text-xs font-medium text-secondary mb-2">画面名：{screenName}</div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1 h-8 border border-dashed border-[#D4D3CF] rounded-md flex items-center px-2 text-xs text-faint">
          検索：{fields[0] ?? "項目"}
        </div>
        {actions.map((action, i) => (
          <div key={i} className="h-8 px-3 border border-border rounded-md flex items-center text-xs whitespace-nowrap">
            {action}
          </div>
        ))}
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <div className="grid text-xs font-medium bg-sidebar px-2 py-1.5" style={{ gridTemplateColumns: `repeat(${fields.length}, 1fr)` }}>
          {fields.map((f, i) => <span key={i}>{f}</span>)}
        </div>
        {[0, 1].map((row) => (
          <div key={row} className="grid text-xs text-secondary border-t border-[#F1F1EF] px-2 py-1.5" style={{ gridTemplateColumns: `repeat(${fields.length}, 1fr)` }}>
            {fields.map((_, i) => <span key={i}>―――</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 3: 画面プレビューページを作成

新規ファイル `src/app/projects/[id]/chapters/9/screens/page.tsx`。

```tsx
import { listRequirementItems } from "@/actions/requirement-items";
import { ScreenWireframe } from "@/components/domain/screen-wireframe/ScreenWireframe";

export default async function ScreenPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await listRequirementItems(id, 9);

  const screenItems = items.filter((item) => (item.content.screen_fields ?? "").trim() !== "");

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <h1 className="text-base font-semibold text-primary mb-4">機能要件：画面イメージ</h1>

      {screenItems.length === 0 ? (
        <p className="text-sm text-secondary">画面情報（表示項目）が入力された機能要件がありません</p>
      ) : (
        <div className="flex flex-col gap-4">
          {screenItems.map((item) => (
            <ScreenWireframe
              key={item.id}
              screenName={item.content.name ?? "(名称未設定)"}
              pattern={item.content.screen_pattern ?? ""}
              fields={(item.content.screen_fields ?? "").split(",").map((f) => f.trim()).filter(Boolean)}
              actions={(item.content.screen_actions ?? "").split(",").map((a) => a.trim()).filter(Boolean)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

## Step 4: 機能要件ページから画面プレビューへの導線を追加

`src/app/projects/[id]/chapters/[chapterNo]/page.tsx`の9章表示時に、プレビューページへのリンクを追加する。

```tsx
{chapterNum === 9 && (
  <a href={`/projects/${id}/chapters/9/screens`} className="text-sm text-secondary underline">
    画面イメージを見る
  </a>
)}
```

## Step 5: 動作確認

1. `/projects/{id}/chapters/9` で、機能要件の1行に以下を入力する
   - 名称：`顧客一覧画面`
   - 画面パターン：`一覧`
   - 表示項目：`顧客名,電話番号,最終取引日`
   - 操作：`検索,新規登録`
2. `/projects/{id}/chapters/9/screens` にアクセスし、上記の内容がワイヤーフレームとして表示されることを確認（表形式のヘッダーに3項目、上部に検索欄と2つの操作ボタン）
3. 画面パターンを`一覧`以外（例：`詳細`）にした行では、「未対応です」の表示になることを確認
4. `screen_fields`が空欄の行はプレビュー一覧に表示されないことを確認

## やってはいけないこと

- このStepで「詳細」「入力フォーム」等、一覧以外のパターンの描画ロジックを作り込まない（Step6以降で拡張する）
- `RequirementTable`コンポーネント自体にワイヤーフレーム描画ロジックを組み込まない（別ページ・別コンポーネントとして分離する）

## 完了条件

- [ ] テンプレートCに画面用列を追加済み
- [ ] `ScreenWireframe`（一覧パターンのみ）実装済み
- [ ] 画面プレビューページで実データからワイヤーフレームが生成されることを確認済み
