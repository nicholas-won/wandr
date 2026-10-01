"use client";

/**
 * Toasts with an optional action (P7: "undo on every action"). Announced via an aria-live region.
 * Wrap the app in <Toaster>; call `useToast().toast({ title, action })`.
 */
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: "default" | "error";
  /** e.g. { label: "Undo", onClick } */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};
type ToastItem = ToastInput & { id: number };

const Ctx = React.createContext<{ toast: (t: ToastInput) => void; dismiss: (id: number) => void } | null>(null);

export function useToast() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <Toaster>");
  return c;
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);
  const dismiss = React.useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = React.useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.durationMs ?? (t.action ? 8000 : 4000));
    },
    [dismiss],
  );
  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm animate-toast-in items-center gap-3 rounded-xl px-4 py-3 shadow-lg",
              t.variant === "error" ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description ? <p className="text-sm opacity-90">{t.description}</p> : null}
            </div>
            {t.action ? (
              <button
                type="button"
                className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold underline-offset-2 hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
