import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="max-w-md mx-auto mt-20 text-center">
      <div className="text-sm font-medium text-primary mb-2">ページが見つかりません</div>
      <p className="text-sm text-secondary mb-4">存在しない、またはアクセス権限のない案件・ページです。</p>
      <Link href="/projects" className="text-sm underline">案件一覧へ戻る</Link>
    </Card>
  );
}
