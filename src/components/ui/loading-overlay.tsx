"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { BrandSpinner } from "@/components/ui/brand-spinner";

type LoadingContextValue = { increment: () => void; decrement: () => void };
const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingOverlayProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  const decrement = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  return (
    <LoadingContext.Provider value={{ increment, decrement }}>
      {children}
      {count > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-page/80 backdrop-blur-sm">
          <BrandSpinner label="処理中..." />
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useGlobalPending(isPending: boolean) {
  const ctx = useContext(LoadingContext);
  useEffect(() => {
    if (!ctx || !isPending) return;
    ctx.increment();
    return () => ctx.decrement();
  }, [isPending, ctx]);
}
