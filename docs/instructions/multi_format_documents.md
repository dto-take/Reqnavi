# 指示書：資料形式の拡張（PPT・Excel・Word・PDF・画像・テキスト対応）

## 目的

これまでテキスト系ファイル（.txt/.md）のみ実際の中身を読み取っていた資料抽出処理を、PowerPoint・Excel・Word・PDF・画像・テキストの6形式に対応させる。分類（Phase1 Step1）・AI素案生成（Phase1 Step5）の両方で一貫した抽出処理を行う共通関数に統一する。

## 方針

- **画像**：テキスト抽出はせず、Geminiのマルチモーダル機能（画像を直接理解する）にそのまま渡す
- **PDF・Word・Excel・PowerPoint**：テキスト抽出ライブラリでプレーンテキスト化してから渡す
- **テキスト（.txt/.md）**：既存どおりそのまま読み取る

## 前提確認

- Geminiのクォータが利用可能な状態であること（動作確認にAI呼び出しを伴うため）

---

## Step 1: テキスト抽出ライブラリを導入

```bash
npm install officeparser --save
```

**注意**：`officeparser`はPDF・Word（.docx）・Excel（.xlsx）・PowerPoint（.pptx）を単一のライブラリで扱える想定で選定した。実際のインストール後、`node_modules/officeparser`のREADME・型定義を確認し、想定しているAPI（`parseOfficeAsync(buffer)`等、非同期でプレーンテキストを返す関数）が実際の公開APIと一致するか確認すること。異なる場合は実際のAPIに合わせて以降のコードを調整する。

## Step 2: 資料抽出の共通関数を作成

新規ファイル `src/lib/ai/extract-content.ts`（通常モジュール）。

```ts
export type ExtractedContent =
  | { kind: "text"; content: string }
  | { kind: "image"; base64: string; mimeType: string }
  | { kind: "unsupported" };

const OFFICE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export async function extractContent(file: File): Promise<ExtractedContent> {
  if (file.type === "text/plain" || file.type === "text/markdown") {
    return { kind: "text", content: await file.text() };
  }

  if (file.type.startsWith("image/")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return { kind: "image", base64: buffer.toString("base64"), mimeType: file.type };
  }

  if (OFFICE_MIME_TYPES.includes(file.type)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const officeParser = await import("officeparser");
    try {
      const text = await officeParser.parseOfficeAsync(buffer);
      return { kind: "text", content: text };
    } catch {
      return { kind: "unsupported" };
    }
  }

  return { kind: "unsupported" };
}
```

**注意**：`officeParser.parseOfficeAsync`の実際の関数名・引数形式（Bufferを直接受け取れるか、ファイルパスが必要か等）はStep1の確認結果に合わせて修正すること。

## Step 3: 分類処理（classifyDocument）を更新

`src/lib/ai/classify-document.ts`を修正し、`extractContent`を使う形にする。画像の場合はGeminiへマルチモーダル入力として渡す。

```ts
import { extractContent } from "@/lib/ai/extract-content";

export async function classifyDocument(file: File) {
  const extracted = await extractContent(file);
  const promptBody = await getActivePrompt("classify_document");

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let contents: unknown;
  if (extracted.kind === "text") {
    contents = promptBody.replace("{document_excerpt}", extracted.content.slice(0, 4000));
  } else if (extracted.kind === "image") {
    contents = [
      { text: promptBody.replace("{document_excerpt}", "（画像を直接参照してください）") },
      { inlineData: { mimeType: extracted.mimeType, data: extracted.base64 } },
    ];
  } else {
    contents = promptBody.replace("{document_excerpt}", `[ファイル名からの推測: ${file.name}]`);
  }

  const response = await callGeminiSafely(() =>
    ai.models.generateContent({ model: "gemini-2.5-flash", contents })
  );
}
```

**注意**：`contents`の型・マルチモーダル入力の実際の構造（`inlineData`のキー名がキャメルケースかスネークケースか等）は、既存の`ai-draft.ts`や他のGemini呼び出し箇所で確立済みの実装パターンを参照し、それと矛盾しない形に合わせること。

## Step 4: AI素案生成（generateDraft）を更新

`src/actions/ai-draft.ts`の資料抜粋を作る箇所を、`extractContent`を使う形に統一する。

```ts
const excerptParts = await Promise.all(
  documents.map(async (d) => {
    const { data: file } = await supabase.storage.from("project-documents").download(d.storage_path);
    if (!file) return { kind: "text" as const, content: `[取得不可: ${d.file_name}]` };
    const extracted = await extractContent(file as unknown as File);
    if (extracted.kind === "text") {
      return { kind: "text" as const, content: `--- ${d.file_name} ---\n${extracted.content.slice(0, 3000)}` };
    }
    if (extracted.kind === "image") {
      return { kind: "image" as const, base64: extracted.base64, mimeType: extracted.mimeType, fileName: d.file_name };
    }
    return { kind: "text" as const, content: `[未対応の形式: ${d.file_name}]` };
  })
);
```

このあと、`contents`をGeminiに渡す際、テキストパートと画像パートを混在させたマルチモーダル配列として組み立てる（テキスト資料はまとめて1つのテキストパートに、画像資料はそれぞれ`inlineData`パートとして追加する）。

**注意**：`supabase.storage.download()`が返す型（`Blob`）と、`extractContent`が受け取る`File`型に差異がある可能性がある。`File`固有のメソッド（`.name`等）を使っている箇所があれば、`Blob`ベースの実装に調整すること。

## Step 5: アップロード画面のヒントを更新

`src/app/projects/[id]/documents/page.tsx`の`<input type="file">`に`accept`属性を追加し、対応形式を明示する（完全な制限ではなく、ユーザーへの分かりやすさのための指定とする）。

```tsx
<input
  type="file"
  name="file"
  accept=".txt,.md,.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,image/*"
  required
  className="..."
/>
```

対応外の形式がアップロードされた場合（`extractContent`が`unsupported`を返す場合）、分類結果は「その他」扱いとし、AI素案生成では該当資料をスキップする（エラーにはしない）。

## Step 6: 動作確認

1. PDF・Word・Excel・PowerPoint・画像（PNG/JPG）・テキストファイルをそれぞれ1件ずつアップロードする
2. 各ファイルが正しく分類される（章名タグが適切に付く）ことを確認する
3. 画像資料について、AI素案生成時にGeminiが画像の内容を理解した結果を生成できることを確認する
4. Word/Excel/PowerPoint資料から、テキスト抽出→AI素案生成が正しく機能することを確認する
5. 対応外の形式（例：.zip）をアップロードした場合、エラーにならず「その他」に分類され、素案生成時にスキップされることを確認する

## やってはいけないこと

- `officeparser`の実際のAPIを確認せず、指示書のサンプルコードをそのまま信じて実装しない（Step1の確認を必ず行う）
- 画像資料をテキスト抽出しようとしない（OCR等は行わず、Geminiのマルチモーダル理解にそのまま委ねる）

## 完了条件

- [ ] `extractContent`共通関数実装済み
- [ ] 分類・AI素案生成の両方が6形式に対応済み
- [ ] 6形式それぞれで動作確認済み
- [ ] 対応外形式でのスキップ処理を確認済み
