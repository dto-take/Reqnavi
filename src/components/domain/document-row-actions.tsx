"use client";

import { useTransition } from "react";
import { deleteDocument, countDocumentSourceItems } from "@/actions/documents";
import { runAction } from "@/lib/run-action";
import { useToast } from "@/components/ui/toast";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";

// 資料の行の「⋯」メニュー（削除）。案件のメンバーであるadmin・pmにだけ表示する（サーバー側でも拒否する）。
export function DocumentRowActions({ documentId, fileName }: { documentId: string; fileName: string }) {
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function handleDelete() {
    startTransition(async () => {
      const counted = await runAction(() => countDocumentSourceItems(documentId), show);
      if (!counted) return;
      const n = counted.data;
      const message =
        `「${fileName}」を削除しますか？\n\n` +
        `この資料を出典とする項目が ${n} 件あります。削除すると、それらの項目から、この資料への出典の表示が外れます。項目の内容は残ります。\n\nこの操作は取り消せません。`;
      if (!confirm(message)) return;
      const r = await runAction(() => deleteDocument(documentId), show);
      if (r) show("資料を削除しました");
    });
  }

  return (
    <Menu
      trigger={({ onClick }) => (
        <Button variant="ghost" size="sm" onClick={onClick} disabled={isPending} aria-label="資料の操作" data-document-menu>
          ⋯
        </Button>
      )}
    >
      <MenuItem onClick={handleDelete} danger>
        削除
      </MenuItem>
    </Menu>
  );
}
