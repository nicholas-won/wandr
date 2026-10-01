"use client";

/** Accessible tabs (WAI-ARIA tabs pattern with arrow-key navigation). */
import * as React from "react";
import { cn } from "@/lib/utils";

type TabsCtx = { value: string; setValue: (v: string) => void; baseId: string };
const Ctx = React.createContext<TabsCtx | null>(null);
const useTabs = () => {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("Tabs components must be inside <Tabs>");
  return c;
};

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const baseId = React.useId();
  const setValue = React.useCallback(
    (v: string) => {
      if (value === undefined) setInner(v);
      onValueChange?.(v);
    },
    [value, onValueChange],
  );
  return (
    <Ctx.Provider value={{ value: current, setValue, baseId }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ className, children, label }: { className?: string; children: React.ReactNode; label?: string }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next =
      e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length]
      : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length]
      : e.key === "Home" ? tabs[0]
      : e.key === "End" ? tabs[tabs.length - 1]
      : undefined;
    if (next) {
      e.preventDefault();
      next.focus();
      next.click();
    }
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex h-11 items-center gap-1 rounded-full bg-muted p-1", className)}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className, children, disabled }: { value: string; className?: string; children: React.ReactNode; disabled?: boolean }) {
  const t = useTabs();
  const selected = t.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${t.baseId}-tab-${value}`}
      aria-controls={`${t.baseId}-panel-${value}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => t.setValue(value)}
      className={cn(
        "inline-flex h-9 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors disabled:opacity-50",
        selected && "bg-card text-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const t = useTabs();
  if (t.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${t.baseId}-panel-${value}`}
      aria-labelledby={`${t.baseId}-tab-${value}`}
      tabIndex={0}
      className={cn("mt-4 focus-visible:outline-offset-4", className)}
    >
      {children}
    </div>
  );
}
