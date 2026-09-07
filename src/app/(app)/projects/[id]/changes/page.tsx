import { getDiffFromBaseline, raiseChangeRequest, listChangeRequests } from "@/actions/change-detection";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const CHANGE_TYPE_LABEL: Record<string, string> = { added: "追加", modified: "変更", deleted: "削除" };

export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [diffs, changeRequests] = await Promise.all([
    getDiffFromBaseline(id),
    listChangeRequests(id),
  ]);
  const raisedItemIds = new Set(changeRequests.map((c) => c.item_id));

  return (
    <div className="max-w-3xl mx-auto mt-10 flex flex-col gap-6">
      <Card>
        <h1 className="text-base font-semibold text-primary mb-1">ベースラインからの差分</h1>
        <p className="text-xs text-secondary mb-4">確定版と現在の内容の差分（{diffs.length}件）</p>

        {diffs.length === 0 ? (
          <p className="text-sm text-secondary">ベースラインからの差分はありません</p>
        ) : (
          <div className="flex flex-col gap-3">
            {diffs.map((d) => (
              <div key={d.itemId} className="border border-border rounded-md p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">
                    {d.chapterNo}章 ／ <span className="text-(--status-review-text)">{CHANGE_TYPE_LABEL[d.changeType]}</span>
                  </span>
                  {raisedItemIds.has(d.itemId) && <span className="text-[10px] text-secondary">申請済み</span>}
                </div>
                {!raisedItemIds.has(d.itemId) && (
                  <form action={raiseChangeRequest.bind(null, id)} className="flex flex-col gap-1.5">
                    <input type="hidden" name="item_id" value={d.itemId} />
                    <input type="hidden" name="chapter_no" value={d.chapterNo} />
                    <input type="hidden" name="change_type" value={d.changeType} />
                    <input type="hidden" name="before_content" value={d.beforeContent ? JSON.stringify(d.beforeContent) : ""} />
                    <input type="hidden" name="after_content" value={d.afterContent ? JSON.stringify(d.afterContent) : ""} />
                    <Input name="reason" placeholder="変更理由（必須）" required />
                    <Input name="estimation_impact" placeholder="見積りへの影響（任意）" />
                    <Button type="submit" variant="primary" size="md" className="self-start">変更申請として登録</Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-primary mb-3">登録済みの変更申請</h2>
        {changeRequests.length === 0 ? (
          <p className="text-sm text-secondary">まだ変更申請はありません</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {changeRequests.map((c) => (
              <li key={c.id} className="text-sm bg-sidebar rounded-md px-3 py-2">
                <span className="text-xs text-secondary">{c.chapter_no}章／{CHANGE_TYPE_LABEL[c.change_type]}</span>
                <div>{c.reason}</div>
                {c.estimation_impact && <div className="text-xs text-(--status-needhearing-text)">見積り影響：{c.estimation_impact}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
