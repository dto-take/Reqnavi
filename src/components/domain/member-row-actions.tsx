"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeProjectMember } from "@/actions/project-members";
import { runAction } from "@/lib/run-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

// メンバーの行の「外す」。案件のメンバーであるadmin・pmにだけ表示する（サーバー側でも拒否する）。
export function MemberRowActions({ projectId, userId, displayName }: { projectId: string; userId: string; displayName: string }) {
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();
  const router = useRouter();

  function handleRemove() {
    if (!confirm(`${displayName}さんを、この案件から外します。作成・編集した内容と工数記録は残ります。`)) return;
    startTransition(async () => {
      const r = await runAction(() => removeProjectMember(projectId, userId), show);
      if (!r) return;
      if (r.data.self) {
        // 自分自身を外した場合、この案件は開けなくなるため、案件一覧へ移る
        router.push("/projects");
      } else {
        show("メンバーを外しました");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleRemove} disabled={isPending} data-remove-member={userId}>
      外す
    </Button>
  );
}
