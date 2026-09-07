import { BrandSpinner } from "@/components/ui/brand-spinner";

export default function ProjectLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-page/15 backdrop-blur-md">
      <BrandSpinner label="読み込んでいます..." />
    </div>
  );
}
