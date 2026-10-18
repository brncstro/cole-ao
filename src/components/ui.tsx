"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

export const inputCls =
  "w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-[15px] text-ink placeholder:text-muted/70 disabled:bg-bg disabled:text-muted aria-[invalid=true]:border-neg";

export const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-10";
export const btnPrimary = `${btnBase} bg-accent text-accent-ink hover:bg-[#244d52]`;
export const btnSecondary = `${btnBase} border border-line-strong bg-white text-ink hover:bg-bg`;
export const btnGhost = `${btnBase} text-ink hover:bg-black/5`;
export const btnDanger = `${btnBase} bg-neg text-white hover:bg-[#99201a]`;

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 aria-hidden className={`animate-spin ${className || "size-4"}`} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className = "",
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  htmlFor: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-err`} role="alert" className="mt-1 flex items-start gap-1 text-xs text-neg">
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "muted" }) {
  const tones = {
    neutral: "bg-bg text-ink border-line-strong",
    accent: "bg-accent-soft text-accent border-transparent",
    muted: "bg-transparent text-muted border-line",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-16 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children && <p className="text-sm text-muted">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border bg-white px-3.5 py-2.5 text-sm shadow-lg ${t.kind === "error" ? "border-neg/40" : "border-line-strong"}`}
          >
            {t.kind === "error" ? <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-neg" /> : <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-pos" />}
            <span>{t.text}</span>
            <button className="ml-1 text-muted hover:text-ink" aria-label="Fechar aviso" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- diálogo (nativo: foco preso, Esc fecha)
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-1.5rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-line bg-white p-0 shadow-2xl`}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            <button className={`${btnGhost} !min-h-8 !px-2`} aria-label="Fechar" onClick={onClose}>
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  busy,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={danger ? btnDanger : btnPrimary} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm">{children}</div>
    </Dialog>
  );
}
