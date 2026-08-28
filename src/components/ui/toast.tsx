"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastItem = { id: number; message: string; type: "success" | "error" };
type ToastContextValue = { show: (message: string, type?: "success" | "error") => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded-md text-sm text-white shadow-md ${t.type === "success" ? "bg-brand" : "bg-[#A23B2E]"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastはToastProviderの内側で使用すること");
  return ctx;
}
