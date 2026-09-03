# 指示書：バグ修正（ロードマップ表示・AI素案の重複）・小規模UX改善5点

## 目的

### バグ修正
1. 3章（ロードマップ）でAI素案生成を実行しても項目が表示されない原因を調査・修正する
2. 「AI素案を生成」を複数回実行すると、同等の内容で新規レコードが重複作成される問題を解消する

### 小規模UX改善
3. 確定判定ダッシュボードの各行から、対応する章ページへ遷移できるようにする
4. 曖昧表現バッジ（「⚠ N」）の意味を、ホバーなしでも分かるようにする
5. 工数記録に、誰が記録したか（記録者名）を表示する
6. 案件一覧の「確定n件」を、分母（全n件中m件確定）が分かる表示にする
7. 「Wordで出力」ボタンを、メンバー画面から案件トップ画面に移動する

## 前提確認

- 案件削除機能・Vercel環境の一本化が完了していること

---

## Step 1（調査）: 3章（ロードマップ）でAI素案が表示されない原因を特定

以下を順に確認し、**原因が分かった時点で報告してほしい**（原因によって対処が変わるため、断定的な修正コードはこの指示書には含めない）。

1. `ai_interactions`テーブルで、対象案件・3章に関する直近の実行記録を確認する（`input_summary`に`chapter_no: 3`が含まれる行）。記録が無ければ、`generateDraft`が3章に対して呼ばれる前の段階（ボタンのbind引数、`CHAPTER_TEMPLATE_MAP`のlookup等）で処理が止まっている可能性がある
2. 記録があれば、その`output`列の中身を確認する。AIの応答が空、またはZodバリデーション失敗（`{error: "validation_failed"}`）になっていないか
3. `requirement_items`テーブルで、対象案件・`chapter_no = 3`の行が実際に作成されているか確認する。**作成されているのに画面に表示されない場合**、`chapters/[chapterNo]/page.tsx`または`RequirementTable`側の表示ロジックに3章固有の問題がある（例：`CHAPTER_NAMES[3]`が正しく解決されない等）
4. `source_documents`で、「ロードマップ」というタグが実際に`classified_tags`に含まれる資料が存在するか、`generateDraft`内で使っている章名の文字列（`CHAPTER_NAMES`由来）と完全に一致しているか確認する

原因が判明したら、該当箇所を修正すること。

## Step 2: AI素案生成の重複作成を解消

`src/actions/ai-draft.ts`の`generateDraft`に、生成前に既存の未レビューAI素案を削除する処理を追加する。

```ts
await supabase
  .from("requirement_items")
  .delete()
  .eq("project_id", projectId)
  .eq("chapter_no", chapterNo)
  .eq("status", "ai_draft");
```

**注意**：この削除は「再生成＝AIの素案を作り直す」という意図に基づく。`se_reviewing`（人が確認中）・`confirmed`・`exception_approved`・`rejected`の項目は対象外とし、誤って人がレビュー済みの内容を消さないようにする。削除後に`item_sources`の孤立レコードが残らないよう、そのFKが`ON DELETE CASCADE`になっていること（案件削除機能のStepで対応済みのはず）を確認すること。

## Step 3: 確定判定ダッシュボードから章への遷移

`src/app/projects/[id]/readiness/page.tsx`の各行を`Link`でラップする。

```tsx
<Link key={s.chapterNo} href={`/projects/${id}/chapters/${s.chapterNo}`} className="grid grid-cols-4 items-center bg-sidebar rounded-md px-3 py-2 text-sm hover:bg-hover">
  {/* 既存の行内容はそのまま */}
</Link>
```

## Step 4: 曖昧表現バッジの分かりやすさ改善

`RequirementTable.tsx`の曖昧表現バッジを、アイコンのみでなくラベル付きにする。

```tsx
<span title={/* 既存のtitle */} className="text-xs text-[#9F6B00] cursor-help">
  ⚠ 曖昧表現 {item.ambiguous_flags.length}件
</span>
```

## Step 5: 工数記録に記録者を表示

`src/actions/effort-logs.ts`の`listEffortLogs`を修正し、記録者名を取得する。

```ts
export type EffortLog = {
  id: string;
  work_start_date: string;
  work_end_date: string;
  hours_spent: number;
  note: string | null;
  recorded_by: string;
  recordedByName: string | null;
};

export async function listEffortLogs(projectId: string): Promise<EffortLog[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("effort_logs")
    .select("id, work_start_date, work_end_date, hours_spent, note, recorded_by, user_profiles(display_name)")
    .eq("project_id", projectId)
    .order("work_start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((log) => ({
    ...log,
    recordedByName: (log.user_profiles as unknown as { display_name: string } | null)?.display_name ?? "(不明)",
  }));
}
```

**注意**：`effort_logs.recorded_by`から`user_profiles`への埋め込みJOINが機能するには、FKが`user_profiles(user_id)`を参照している必要がある（規約14参照）。`auth.users`を直接参照している場合はJOINが解決できないため、その場合は個別に`user_profiles`を取得して手動でマッピングする実装に変更すること。

`src/app/projects/[id]/effort/page.tsx`の一覧表示に、`log.recordedByName`を追加する。

## Step 6: 案件一覧の確定件数表示を分母付きに

案件一覧の軽量集計（`listProjectsReadinessSummary`、見栄え向上Stepで新設したもの）が、確定件数だけでなく全件数も返すよう修正する（`grep -rn "listProjectsReadinessSummary"`で定義箇所を確認してから修正する）。

```ts
return { confirmedCount, totalCount };
```

案件一覧カードの表示を「確定n件」から「確定 n/m件」に変更する。

## Step 7: 「Wordで出力」を案件トップ画面に移動

`src/app/projects/[id]/members/page.tsx`から「Wordで出力」のリンクを削除し、`src/app/projects/[id]/page.tsx`（案件トップ）の概要カード付近に追加する。

```tsx
<a href={`/api/projects/${id}/export`} className="text-xs text-secondary underline">
  Wordで出力
</a>
```

## Step 8: 動作確認

1. Step1で特定した原因が解消され、3章でAI素案生成→項目が表示されることを確認する
2. 同じ章で「AI素案を生成」を2回連続実行し、項目が重複せず、AI由来の項目が新しい内容に置き換わることを確認する（人が確定・レビュー中にした項目は残ることも確認する）
3. 確定判定ダッシュボードの行をクリックし、対応する章に遷移することを確認する
4. 曖昧表現バッジが「⚠ 曖昧表現N件」のように、ホバーしなくても意味が分かる表示になっていることを確認する
5. 工数記録一覧に記録者名が表示されることを確認する
6. 案件一覧で「確定 n/m件」の表示になっていることを確認する
7. 案件トップ画面から「Wordで出力」が実行でき、メンバー画面からは無くなっていることを確認する

## やってはいけないこと

- Step2の削除処理で、`ai_draft`以外のステータス（`se_reviewing`等）の項目を巻き込んで削除しない
- Step1の原因調査を飛ばして、当てずっぽうの修正を先に当てない（原因を特定してから対処する）

## 完了条件

- [ ] 3章の表示不具合の原因特定・修正済み
- [ ] AI素案再生成時の重複が解消済み（既存ai_draftの置き換え方式）
- [ ] 確定判定ダッシュボードからの遷移実装済み
- [ ] 曖昧表現バッジの表示改善済み
- [ ] 工数記録の記録者表示実装済み
- [ ] 案件一覧の分母表示実装済み
- [ ] Word出力ボタンの移動済み
- [ ] 全項目の動作確認済み
