# 指示書：案件トップ画面の出力リンク（Word/PowerPoint）の復元

## 目的

案件トップ画面から「Wordで出力」「PowerPointで出力」へのリンクが失われている。復元し、ボタンとして視認性を上げる。

## 前提確認

- なし（緊急の復元対応のため単独で着手してよい）

---

## Step 1: 現状を確認

`src/app/(app)/projects/[id]/page.tsx`を開き、`/api/projects/[id]/export`（Word）・`/api/projects/[id]/export-pptx`（PowerPoint）へのリンクが実際に存在するか確認する。

`git log`・`git blame`等で、いつの変更でこれらのリンクが削除されたか（または一度も反映されていなかったか）を確認してもよい（原因究明は必須ではないが、分かれば報告してほしい）。

## Step 2: リンクを復元・改善

案件トップ画面の概要カード付近に、以下を追加する（`Button`コンポーネントを使い、小さな文字リンクより視認性の高い形にする）。

```tsx
import { Button } from "@/components/ui/button";

<div className="flex gap-2 mt-3">
  <a href={`/api/projects/${id}/export`}>
    <Button variant="secondary" size="sm">Wordで出力</Button>
  </a>
  <a href={`/api/projects/${id}/export-pptx`}>
    <Button variant="secondary" size="sm">PowerPointで出力（サマリー）</Button>
  </a>
</div>
```

## Step 3: 動作確認

1. 案件トップ画面に、「Wordで出力」「PowerPointで出力」の2つのボタンが表示されることを確認する
2. それぞれクリックし、正しいファイル（`.docx`・`.pptx`）がダウンロードされることを確認する
3. 案件トップ画面の他の要素（概要カード・次にやるべきこと・ステップ・ナレッジ）が引き続き正しく表示されていることを確認する

## 完了条件

- [ ] Word/PowerPoint出力ボタンが案件トップ画面に復元されていることを確認済み
- [ ] 両方のダウンロードが正常に動作することを確認済み
