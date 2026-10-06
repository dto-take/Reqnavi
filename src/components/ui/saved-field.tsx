"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// onBlurで保存する入力欄の共通の仕組み（保存失敗時の入力欄の復元。規約58）。
//   ・最後に保存できた値を保持し、保存が成功したら更新する
//   ・保存が失敗（ok:false・通信断とも。saveがfalseを返す）したら、入力欄を最後に保存できた値へ戻し、
//     再取得（router.refresh）して、表示をDBの実際の状態に揃える（確定済みになった等で拒否された場合に、
//     他の人の変更が反映される）。トーストはsave側（runAction）が1件だけ出す
//   ・規約58：keyにid＋サーバーの値（value）を含める。外部要因（ドラッグ・カスケード・他ユーザーの操作・再取得）で
//     値が変わったら、確実に再マウントして、古い値が残らないようにする
// 使い方：
//   <SavedField id={入力欄のid} value={サーバーの値} save={(v) => 保存してbooleanを返す}>
//     {(f) => <Input value={f.value} onChange={(e) => f.onChange(e.target.value)} onBlur={(e) => f.commit(e.target.value)} />}
//   </SavedField>
// （selectは onChange で f.onChange(v) と f.commit(v) の両方を呼ぶ）
export type SavedFieldApi = {
  value: string;
  onChange: (value: string) => void;
  commit: (value: string) => void;
};

export function SavedField({
  id,
  value,
  save,
  children,
}: {
  id: string; // 入力欄を一意に識別するid（ノード・項目・列を含める）
  value: string;
  save: (value: string) => Promise<boolean>;
  children: (field: SavedFieldApi) => ReactNode;
}) {
  return (
    <SavedFieldInner key={`${id}\u0000${value}`} value={value} save={save}>
      {children}
    </SavedFieldInner>
  );
}

function SavedFieldInner({
  value,
  save,
  children,
}: {
  value: string;
  save: (value: string) => Promise<boolean>;
  children: (field: SavedFieldApi) => ReactNode;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(value);
  const [lastSaved, setLastSaved] = useState(value); // 最後に保存できた値

  async function commit(next: string) {
    if (next === lastSaved) return;
    const ok = await save(next);
    if (ok) {
      setLastSaved(next);
    } else {
      setDraft(lastSaved);
      router.refresh();
    }
  }

  return <>{children({ value: draft, onChange: setDraft, commit: (v) => void commit(v) })}</>;
}
