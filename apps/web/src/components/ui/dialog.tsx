"use client";

/**
 * Dialog and Sheet on the native <dialog> element: focus trapping, Escape-to-close and the
 * top layer come from the browser, so no extra dependency. Controlled via `open`/`onOpenChange`.
 */
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Hide the visible title (still announced to screen readers). */
  hideTitle?: boolean;
};

function useNativeDialog(open: boolean, onOpenChange: (o: boolean) => void) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClose = () => onOpenChange(false);
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onOpenChange]);
  // Click on the backdrop (the dialog element itself, outside the panel) closes.
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onOpenChange(false);
  };
  return { ref, onClick };
}

function Header({ title, description, hideTitle, onClose }: Pick<BaseProps, "title" | "description" | "hideTitle"> & { onClose: () => void }) {
  const titleId = React.useId();
  return (
    <div className="flex items-start gap-3 pb-3">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className={cn("font-display text-xl font-bold tracking-tight", hideTitle && "sr-only")}>
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-mr-2 -mt-1 inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, className, hideTitle }: BaseProps) {
  const { ref, onClick } = useNativeDialog(open, onOpenChange);
  return (
    <dialog
      ref={ref}
      onClick={onClick}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-popover p-0 text-popover-foreground shadow-2xl",
        className,
      )}
    >
      <div className="p-5">
        <Header title={title} description={description} hideTitle={hideTitle} onClose={() => onOpenChange(false)} />
        {children}
      </div>
    </dialog>
  );
}

/** Bottom sheet on phones; centered panel on larger screens. */
export function Sheet({ open, onOpenChange, title, description, children, className, hideTitle }: BaseProps) {
  const { ref, onClick } = useNativeDialog(open, onOpenChange);
  return (
    <dialog
      ref={ref}
      onClick={onClick}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "mx-auto mb-0 mt-auto max-h-[90dvh] w-full max-w-lg rounded-t-xl border bg-popover p-0 text-popover-foreground shadow-2xl sm:mb-auto sm:rounded-xl",
        className,
      )}
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto -mt-2 mb-3 h-1.5 w-10 rounded-full bg-muted sm:hidden" />
        <Header title={title} description={description} hideTitle={hideTitle} onClose={() => onOpenChange(false)} />
        {children}
      </div>
    </dialog>
  );
}
