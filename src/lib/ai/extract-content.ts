export type ExtractedContent =
  | { kind: "text"; content: string }
  | { kind: "image"; base64: string; mimeType: string }
  | { kind: "unsupported" };

// Blob.type（特にSupabase Storageからdownload()したBlobや.md拡張子）は実際には
// 信頼できないことがある（documents.tsの既存実装で確認済み）ため、拡張子を正としてMIME種別を決める。
const EXTENSION_MIME_MAP: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const OFFICE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

// fileNameを別引数で受け取るのは、アップロード時のFile（.nameを持つ）と
// 再分類時のBlob（storageからdownload()した戻り値、.nameを持たない）の
// 両方から同じ関数を呼べるようにするため（documents.tsの既存実装と同じ理由）。
export async function extractContent(file: Blob, fileName: string): Promise<ExtractedContent> {
  const ext = (fileName.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "").toLowerCase();
  const mimeType = EXTENSION_MIME_MAP[ext] ?? file.type;

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return { kind: "text", content: await file.text() };
  }

  if (mimeType.startsWith("image/")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return { kind: "image", base64: buffer.toString("base64"), mimeType };
  }

  if (OFFICE_MIME_TYPES.includes(mimeType)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      // 静的importだとTurbopackのSSRバンドルでOfficeParserが未定義になる事象を確認したため、
      // 指示書どおり動的importを使う（Step1の注意事項で想定されていた問題）。
      const { parseOffice } = await import("officeparser");
      const ast = await parseOffice(buffer);
      const { value: text } = await ast.to("text");
      return { kind: "text", content: text };
    } catch {
      return { kind: "unsupported" };
    }
  }

  return { kind: "unsupported" };
}
