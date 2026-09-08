# 指示書：PowerPoint出力の方針修正（Word版相当の詳細情報を出力）

## 目的

前回実装した「サマリーのみ」のPowerPoint出力を、**Word出力（Phase1 Step9）と同等の詳細情報**を含む形に作り直す。文書（Word）とスライド（PowerPoint）という**形式の違い**であり、情報量の違いにはしない。

## 前提確認

- 前回のPowerPointサマリー出力の実装が完了していること
- `src/app/api/projects/[id]/export/route.ts`（Word出力、Phase1 Step9）の実装内容を先に確認し、章ごとのデータ取得ロジック（テンプレートA/B/C→表、D→階層テキスト、E→チェックリスト）をそのまま参考にすること

---

## Step 1: 既存のPowerPoint出力を作り直す

`src/app/api/projects/[id]/export-pptx/route.ts`を、以下の構成に変更する。

1. タイトルスライド（案件名・顧客組織名）は維持する
2. 概要スライド（充足率・資料件数等）は維持してよい（先頭に1枚残す）
3. **各章について、Word出力と同じデータを取得し、スライドとして展開する**

```ts
for (const chapterNo of chapterNumbers) {
  const templateType = CHAPTER_TEMPLATE_MAP[chapterNo];

  if (!templateType) {
    const slide = pres.addSlide();
    slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}`, { x: 0.5, y: 0.4, w: 12, h: 0.8, fontSize: 22, bold: true, color: NAVY });
    slide.addText("（自由記述章のため、本出力の対象外です）", { x: 0.7, y: 1.5, w: 11, h: 1, fontSize: 12, color: GRAY });
    continue;
  }

  if (templateType === "D") {
    await addKpiSlides(pres, projectId, chapterNo);
    continue;
  }
  if (templateType === "E") {
    await addChecklistSlides(pres, projectId, chapterNo);
    continue;
  }

  await addTableSlides(pres, projectId, chapterNo, templateType);
}
```

## Step 2: 表形式（A/B/C）を複数スライドに分割する関数を作成

PowerPointの1スライドに収まる行数には限りがあるため、**1スライドあたり最大6行程度**を目安にページングする。

```ts
async function addTableSlides(pres: InstanceType<typeof PptxGenJS>, projectId: string, chapterNo: number, templateType: string) {
  const supabase = await createServerActionClient();
  const { data: columns } = await supabase
    .from("chapter_column_templates")
    .select("column_key, label")
    .eq("template_type", templateType)
    .order("order_index");
  const { data: items } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo)
    .order("order_index");

  const cols = columns ?? [];
  const rows = items ?? [];
  const ROWS_PER_SLIDE = 6;

  if (rows.length === 0) {
    const slide = pres.addSlide();
    slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}`, { x: 0.5, y: 0.4, w: 12, h: 0.8, fontSize: 22, bold: true, color: NAVY });
    slide.addText("（この章にはまだ項目がありません）", { x: 0.7, y: 1.5, w: 11, h: 1, fontSize: 12, color: GRAY });
    return;
  }

  for (let i = 0; i < rows.length; i += ROWS_PER_SLIDE) {
    const pageRows = rows.slice(i, i + ROWS_PER_SLIDE);
    const slide = pres.addSlide();
    const pageLabel = rows.length > ROWS_PER_SLIDE ? `（${Math.floor(i / ROWS_PER_SLIDE) + 1}/${Math.ceil(rows.length / ROWS_PER_SLIDE)}）` : "";
    slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}${pageLabel}`, { x: 0.5, y: 0.3, w: 12, h: 0.6, fontSize: 20, bold: true, color: NAVY });

    const tableData = [
      cols.map((c) => ({ text: c.label, options: { bold: true, fill: { color: "F1EFE8" }, fontSize: 10 } })),
      ...pageRows.map((row) => cols.map((c) => ({ text: (row.content as Record<string, string>)[c.column_key] ?? "", options: { fontSize: 9 } }))),
    ];
    slide.addTable(tableData, { x: 0.4, y: 1.1, w: 12.5, h: 5.5, border: { type: "solid", color: "E5E1D8", pt: 0.5 }, autoPage: false });
  }
}
```

**注意**：`slide.addTable`に渡す各セルのテキストが長い場合、指定した行数に収まりきらずスライドからはみ出す可能性がある。フォントサイズ・列幅・1スライドあたりの行数（`ROWS_PER_SLIDE`）は、実際にサンプルデータで出力してみて、読みやすさとはみ出しの有無を見ながら調整すること（正確な値はお任せする）。

## Step 3: KPIツリー（D）・非機能要件（E）用のスライド生成関数を作成

```ts
async function addKpiSlides(pres: InstanceType<typeof PptxGenJS>, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: nodes } = await supabase
    .from("requirement_items")
    .select("id, parent_id, content")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);

  const slide = pres.addSlide();
  slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}`, { x: 0.5, y: 0.4, w: 12, h: 0.8, fontSize: 22, bold: true, color: NAVY });

  if (!nodes || nodes.length === 0) {
    slide.addText("（この章にはまだ項目がありません）", { x: 0.7, y: 1.5, w: 11, h: 1, fontSize: 12, color: GRAY });
    return;
  }

  const lines: string[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const node of nodes!.filter((n) => n.parent_id === parentId)) {
      const content = node.content as { level: string; text: string };
      lines.push(`${"　".repeat(depth)}[${content.level}] ${content.text}`);
      walk(node.id, depth + 1);
    }
  }
  walk(null, 0);

  slide.addText(lines.join("\n"), { x: 0.7, y: 1.4, w: 11.5, h: 5.5, fontSize: 13, color: "37352F", breakLine: true });
}

async function addChecklistSlides(pres: InstanceType<typeof PptxGenJS>, projectId: string, chapterNo: number) {
  const supabase = await createServerActionClient();
  const { data: rows } = await supabase
    .from("requirement_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("chapter_no", chapterNo);

  if (!rows || rows.length === 0) {
    const slide = pres.addSlide();
    slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]}`, { x: 0.5, y: 0.4, w: 12, h: 0.8, fontSize: 22, bold: true, color: NAVY });
    slide.addText("（この章にはまだ項目がありません）", { x: 0.7, y: 1.5, w: 11, h: 1, fontSize: 12, color: GRAY });
    return;
  }

  for (const row of rows) {
    const content = row.content as { category: string; overview: string; checklist: { item: string; status: string }[] };
    const slide = pres.addSlide();
    slide.addText(`${chapterNo}. ${CHAPTER_NAMES[chapterNo]} － ${content.category}`, { x: 0.5, y: 0.4, w: 12, h: 0.8, fontSize: 20, bold: true, color: NAVY });
    slide.addText(content.overview ?? "", { x: 0.7, y: 1.3, w: 11.5, h: 1, fontSize: 12, color: GRAY });
    const checklistLines = (content.checklist ?? []).map((c) => `${c.item}　（${c.status}）`).join("\n");
    slide.addText(checklistLines, { x: 0.7, y: 2.3, w: 11.5, h: 4, fontSize: 13, color: "37352F", breakLine: true });
  }
}
```

## Step 4: 動作確認

1. 全15章のうち、実装済みの章にデータが入った案件でPowerPoint出力を実行する
2. テンプレートA/B/Cの章で、項目数が多い場合に複数スライドへ正しく分割される（「1/2」「2/2」等のページ表記込み）ことを確認する
3. KPI（4章）の階層が、インデント付きテキストとして1枚（または複数枚）のスライドに収まっていることを確認する
4. 非機能要件（10章）で、カテゴリごとに1枚のスライドが作成されることを確認する
5. データが無い章では「まだ項目がありません」の表示になることを確認する
6. Word出力と見比べ、**含まれる情報の範囲がほぼ一致している**ことを確認する（表現形式は異なってよいが、情報の欠落が無いこと）

## やってはいけないこと

- スライドからテーブル内容がはみ出したまま放置しない（行数・フォントサイズの調整、または複数ページへの分割で対応する）
- Word出力側のデータ取得ロジックと、PowerPoint側のロジックを重複して別々に保守しやすい形にしない（可能な範囲で、共通化できる部分は共通の関数に切り出すことを検討してもよいが、必須ではない）

## 完了条件

- [ ] 全章（A/B/C/D/E、対応する章）がPowerPoint出力に含まれることを確認済み
- [ ] 表形式の章がページングされ、はみ出しが無いことを確認済み
- [ ] Word出力との情報範囲の一致を確認済み
