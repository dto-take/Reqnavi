# 指示書：画面ワイヤーフレームの追加パターン（詳細・入力フォーム・ダッシュボード）

## 目的

Phase2 Step5で「一覧」パターンのみ対応だった`ScreenWireframe`コンポーネントに、「詳細」「入力フォーム」「ダッシュボード」パターンを追加する。詳細は `docs/01_requirements.md` §9（機能No.6）を参照。

## 前提確認

- Phase2 Step5（画面ワイ�フレーム生成・一覧パターン）が完了していること
- 認証・メンバー管理の作り忘れ解消が完了していること（本Stepとは独立のため、順不同で対応可）

---

## Step 1: ScreenWireframeコンポーネントにパターン分岐を追加

`src/components/domain/screen-wireframe/ScreenWireframe.tsx`を以下のように拡張する。既存の「一覧」パターンのロジックは変更しない。

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
  const normalizedPattern = pattern.trim();

  if (normalizedPattern === "一覧") {
    return <ListWireframe screenName={screenName} fields={fields} actions={actions} />;
  }
  if (normalizedPattern === "詳細") {
    return <DetailWireframe screenName={screenName} fields={fields} actions={actions} />;
  }
  if (normalizedPattern === "入力フォーム") {
    return <FormWireframe screenName={screenName} fields={fields} actions={actions} />;
  }
  if (normalizedPattern === "ダッシュボード") {
    return <DashboardWireframe screenName={screenName} fields={fields} />;
  }

  return (
    <div className="text-xs text-secondary p-3 border border-dashed border-border rounded-md">
      「{pattern || "未設定"}」パターンは未対応です（一覧・詳細・入力フォーム・ダッシュボードのいずれかを指定してください）
    </div>
  );
}

function ListWireframe({ screenName, fields, actions }: { screenName: string; fields: string[]; actions: string[] }) {
  // Phase2 Step5の既存実装をそのまま移設（変更なし）
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

function DetailWireframe({ screenName, fields, actions }: { screenName: string; fields: string[]; actions: string[] }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-page max-w-md">
      <div className="text-xs font-medium text-secondary mb-3">画面名：{screenName}</div>
      <div className="flex flex-col gap-2 mb-3">
        {fields.map((f, i) => (
          <div key={i} className="grid grid-cols-3 text-xs border-b border-[#F1F1EF] py-1.5">
            <span className="text-secondary">{f}</span>
            <span className="col-span-2 text-faint">―――</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {actions.map((action, i) => (
          <div key={i} className="h-8 px-3 border border-border rounded-md flex items-center text-xs">
            {action}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormWireframe({ screenName, fields, actions }: { screenName: string; fields: string[]; actions: string[] }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-page max-w-sm">
      <div className="text-xs font-medium text-secondary mb-3">画面名：{screenName}</div>
      <div className="flex flex-col gap-2.5 mb-4">
        {fields.map((f, i) => (
          <div key={i}>
            <div className="text-[11px] text-secondary mb-1">{f}</div>
            <div className="h-8 border border-dashed border-[#D4D3CF] rounded-md bg-sidebar" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        {actions.map((action, i) => (
          <div key={i} className="h-8 px-3 bg-primary text-white rounded-md flex items-center text-xs">
            {action}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardWireframe({ screenName, fields }: { screenName: string; fields: string[] }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-page max-w-xl">
      <div className="text-xs font-medium text-secondary mb-3">画面名：{screenName}</div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f, i) => (
          <div key={i} className="border border-border rounded-md p-3 h-20 flex flex-col justify-between">
            <span className="text-[11px] text-secondary">{f}</span>
            <span className="text-lg font-semibold text-primary">―</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**注意**：「ダッシュボード」パターンは`fields`を「表示するKPI・指標の名称一覧」として扱う（一覧・詳細・フォームとは`fields`の意味合いが異なる点に注意。列定義の説明文`docs/02_architecture.md`側は変更不要だが、`chapter_column_templates`の`screen_fields`ラベル自体は「表示項目」のままで問題ない。ダッシュボードの場合はSEが指標名をカンマ区切りで入力する運用として扱う）。

## Step 2: 動作確認

1. 機能要件（9章）に、画面パターンが異なる4行を用意する（一覧・詳細・入力フォーム・ダッシュボード、それぞれ表示項目・操作を入力）
2. `/projects/{id}/chapters/9/screens` にアクセスし、4パターンすべてが崩れずに表示されることを確認
3. 一覧パターンの見た目がPhase2 Step5時点から変化していないことを確認（既存ロジックを移設しただけであることの確認）
4. 未定義のパターン文字列（例：「その他」）を入力した行では、引き続き「未対応です」の表示になることを確認

## やってはいけないこと

- 「一覧」パターンの既存の見た目・ロジックを変更しない（Step1の通り、そのまま移設するだけに留める）

## 完了条件

- [ ] 4パターン（一覧・詳細・入力フォーム・ダッシュボード）すべてが実装され、表示確認済み
- [ ] 未対応パターンのフォールバック表示が維持されていることを確認済み
