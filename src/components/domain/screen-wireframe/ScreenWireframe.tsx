// 注意：この画面内の「ボタン」「入力欄」「カード」に見える要素は、対象案件の画面イメージの
// モックアップ（プレビュー表示）であり、実際に操作可能なUIコンポーネントではない。そのため
// 共通Button/Input/Cardには置き換えず、あえて素のdivのままにする
// （実際に押せてしまうと誤解を招く。またCardはp-6固定のため、この密度優先のモックアップの
// p-4とは意図的に異なる）。
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
          <div key={row} className="grid text-xs text-secondary border-t border-hover px-2 py-1.5" style={{ gridTemplateColumns: `repeat(${fields.length}, 1fr)` }}>
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
          <div key={i} className="grid grid-cols-3 text-xs border-b border-hover py-1.5">
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
          <div key={i} className="h-8 px-3 bg-brand text-white rounded-md flex items-center text-xs">
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
