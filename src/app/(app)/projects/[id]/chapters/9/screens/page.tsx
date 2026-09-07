import Link from "next/link";
import { listRequirementItems } from "@/actions/requirement-items";
import { ScreenWireframe } from "@/components/domain/screen-wireframe/ScreenWireframe";

export default async function ScreenPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await listRequirementItems(id, 9);

  const screenItems = items.filter((item) => (item.content.screen_fields ?? "").trim() !== "");

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <Link href={`/projects/${id}/chapters/9`} className="text-xs text-secondary underline mb-3 inline-block">
        ← 9. 機能要件に戻る
      </Link>
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
