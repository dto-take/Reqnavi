export function BrandSpinner({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <img src="/brand-icon.svg" alt="" className="w-12 h-12 animate-spin-slow" />
      <span className="text-sm text-secondary">{label}</span>
    </div>
  );
}
