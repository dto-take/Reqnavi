export function BrandSpinner({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-brand/25 animate-brand-ripple" />
        <span
          className="absolute inset-0 rounded-full bg-brand/25 animate-brand-ripple"
          style={{ animationDelay: "0.6s" }}
        />
        <img src="/brand-icon.svg" alt="" className="relative w-8 h-8 animate-brand-pulse" />
      </div>
      <span className="text-sm text-secondary">{label}</span>
    </div>
  );
}
