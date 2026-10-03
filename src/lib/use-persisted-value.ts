"use client";

import { useCallback, useSyncExternalStore } from "react";

// localStorageに保存する文字列の値を、useSyncExternalStoreで同期する共通フック（規約54：
// useEffect＋setStateは使わない）。案件一覧の表示形式、案件トップの表示形式・フェーズの開閉で共用する。
// サーバー描画（getServerSnapshot）は常にfallback。保存できない環境（プライベートウィンドウ等）でも、
// 例外を握りつぶして既定値で動く。ブラウザごとの保存のため、別のブラウザでは既定値に戻る。
const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, listener: () => void) {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePersistedValue(key: string, fallback: string): [string, (next: string) => void] {
  const value = useSyncExternalStore(
    useCallback((l: () => void) => subscribe(key, l), [key]),
    () => {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback
  );
  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // 保存できなくても、この画面での切替自体は反映する
      }
      listeners.get(key)?.forEach((l) => l());
    },
    [key]
  );
  return [value, set];
}
