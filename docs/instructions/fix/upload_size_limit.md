# 指示書：資料アップロードのファイルサイズ上限（20MB）の明記・実装

## 目的

1ファイルあたりのアップロード上限を20MBと明示的に定め、クライアント側での事前チェックとStorage側の設定（二重の防御）の両方で実装する。

## 前提確認

- 資料アップロードのクライアント直接Storage送信化が完了していること

---

## Step 1: Supabase Storageのバケット設定で上限を明示する

```bash
supabase migration new set_project_documents_size_limit
```

```sql
update storage.buckets
set file_size_limit = 20971520
where id = 'project-documents';
```

`supabase db reset`（ローカル）で反映後、Stagingにも`supabase db push`で反映すること。

**注意**：この設定により、クライアント側のチェックをすり抜けた場合でも、Supabase Storage自体が20MB超のアップロードを拒否するようになる（多重防御）。

## Step 2: クライアント側で事前チェックする

`src/components/domain/document-upload-zone.tsx`に、ファイル追加時のサイズチェックを追加する。

```tsx
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function addFiles(files: FileList | File[]) {
  const items = Array.from(files).map((file) => {
    if (file.size > MAX_FILE_SIZE) {
      return { file, status: "error" as const, error: "ファイルサイズが上限（20MB）を超えています" };
    }
    return { file, status: "pending" as const };
  });
  setQueue((q) => [...q, ...items]);
}
```

サイズ超過のファイルは、アップロード自体を試みず、キュー内で最初から「失敗」状態として表示する。

## Step 3: 案内文言を追加

`document-upload-zone.tsx`のドラッグ&ドロップ領域の案内文言に、上限を明記する。

```tsx
<p className="text-xs text-faint mt-1">
  PDF・Word・Excel・PowerPoint・画像・テキストに対応（1ファイルあたり20MBまで）
</p>
```

## Step 4: 動作確認

1. 20MB以下のファイルが、これまで通り正常にアップロードできることを確認する
2. 20MBを超えるファイルをドラッグ&ドロップ、または選択した際、アップロードを試みずに即座に「ファイルサイズが上限（20MB）を超えています」という失敗表示になることを確認する
3. 案内文言に「1ファイルあたり20MBまで」が表示されていることを確認する
4. （念のため）クライアント側のチェックを一時的に無効化した状態で20MB超のファイルを送信し、Supabase Storage側でも拒否されることを確認する（確認後は無効化を元に戻すこと）

## やってはいけないこと

- クライアント側のチェックのみに頼り、Storage側の`file_size_limit`設定を省略しない

## 完了条件

- [ ] Storageバケットの`file_size_limit`（20MB）設定済み、ローカル・Staging双方に反映済み
- [ ] クライアント側の事前チェック実装済み
- [ ] 案内文言の追加済み
- [ ] 動作確認済み（正常系・上限超過・多重防御）
