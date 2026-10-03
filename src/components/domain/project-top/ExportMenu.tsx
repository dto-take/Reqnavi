"use client";

import { Menu, MenuItem } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { buttonClasses } from "@/components/ui/button";
import { useFileDownload } from "@/components/ui/download-button";

// 「出力 ▾」：Word／PowerPoint。生成には時間がかかるため、メニューを閉じたあとも、
// トリガーのボタンに「生成中…」を表示して無効化する。取得・保存・エラー処理はDownloadButtonと共通のフック。
export function ExportMenu({ projectId }: { projectId: string }) {
  const { loading, download } = useFileDownload();
  return (
    <Menu
      trigger={({ onClick, open }) => (
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          aria-haspopup="menu"
          aria-expanded={open}
          data-export-trigger
          className={`${buttonClasses("secondary", "md")} gap-1.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1`}
        >
          {loading ? (
            <>
              <Spinner /> 生成中…
            </>
          ) : (
            <>出力 ▾</>
          )}
        </button>
      )}
    >
      <MenuItem onClick={() => download(`/api/projects/${projectId}/export`, "export.docx")}>Wordで出力</MenuItem>
      <MenuItem onClick={() => download(`/api/projects/${projectId}/export-pptx`, "export.pptx")}>PowerPointで出力（サマリー）</MenuItem>
    </Menu>
  );
}
