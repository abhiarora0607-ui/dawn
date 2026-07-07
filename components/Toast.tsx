"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Check, AlertCircle, X } from "lucide-react";

type Toast = { id: number; msg: string; kind: "success" | "error" };
const ToastCtx = createContext<{ toast: (msg: string, kind?: "success" | "error") => void }>({ toast: () => {} });

export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, kind: "success" | "error" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-card-hover text-sm font-medium animate-rise ${t.kind === "success" ? "bg-navy text-white" : "bg-red-600 text-white"}`}>
            {t.kind === "success" ? <Check className="w-4 h-4 text-amber" /> : <AlertCircle className="w-4 h-4" />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = "Delete", onConfirm, onCancel }: {
  open: boolean; title: string; body?: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-card-hover animate-rise">
        <h3 className="font-semibold text-navy text-lg">{title}</h3>
        {body && <p className="text-muted text-sm mt-1">{body}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 border border-navy-line text-navy font-medium py-2.5 rounded-xl hover:bg-surface">Cancel</button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
