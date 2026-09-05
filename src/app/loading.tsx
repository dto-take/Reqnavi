import { BrandSpinner } from "@/components/ui/brand-spinner";

export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-page/40 backdrop-blur-md">
      <BrandSpinner label="ページを読み込んでいます..." />
    </div>
  );
}
