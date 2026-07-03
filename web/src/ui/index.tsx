import React from "react";
import { cx } from "./cx.js";
import type { SessionStatus } from "../lib/types.js";

/* ---------------- Button ---------------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md";
export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-colors select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
  const sizes: Record<BtnSize, string> = {
    sm: "h-8 px-3 text-[13px]",
    md: "h-9 px-3.5 text-sm",
  };
  const variants: Record<BtnVariant, string> = {
    primary:
      "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/20",
    secondary:
      "bg-surface text-ink-soft border border-line-strong hover:bg-subtle",
    ghost: "text-muted hover:text-ink hover:bg-subtle",
    danger: "bg-surface text-danger border border-line-strong hover:bg-red-50",
  };
  return (
    <button
      className={cx(base, sizes[size], variants[variant], className)}
      {...props}
    />
  );
}

/* ---------------- Card ---------------- */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "bg-surface border border-line rounded-[var(--radius-card)]",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Badge ---------------- */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand" | "ok" | "warn" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-subtle text-muted border-line",
    brand: "bg-brand-50 text-brand-700 border-brand-100",
    ok: "bg-green-50 text-green-700 border-green-100",
    warn: "bg-amber-50 text-amber-700 border-amber-100",
    danger: "bg-red-50 text-red-700 border-red-100",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- StatusDot ---------------- */
const STATUS_COLOR: Record<SessionStatus, string> = {
  starting: "bg-blue-500",
  working: "bg-green-500",
  waiting_input: "bg-amber-500",
  idle: "bg-faint",
  exited: "bg-neutral-400",
  error: "bg-red-500",
};
export const STATUS_TEXT: Record<SessionStatus, string> = {
  starting: "Starting",
  working: "Working",
  waiting_input: "Waiting on you",
  idle: "Idle",
  exited: "Exited",
  error: "Error",
};
export function StatusDot({
  status,
  pulse,
}: {
  status: SessionStatus;
  pulse?: boolean;
}) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && (status === "working" || status === "waiting_input") && (
        <span
          className={cx(
            "absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping",
            STATUS_COLOR[status],
          )}
        />
      )}
      <span
        className={cx(
          "relative inline-flex h-2.5 w-2.5 rounded-full",
          STATUS_COLOR[status],
        )}
      />
    </span>
  );
}

/* ---------------- Input / Textarea / Select ---------------- */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-9 w-full px-3 rounded-lg bg-surface border border-line-strong text-sm text-ink placeholder:text-faint",
        "focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400",
        className,
      )}
      {...props}
    />
  );
});

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "w-full px-3 py-2 rounded-lg bg-surface border border-line-strong text-sm text-ink placeholder:text-faint resize-none",
        "focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-9 px-3 rounded-lg bg-surface border border-line-strong text-sm text-ink",
        "focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-ink mb-1">{label}</div>
      {hint && <div className="text-[13px] text-muted mb-2">{hint}</div>}
      {children}
    </label>
  );
}

/* ---------------- SectionLabel ---------------- */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
      {children}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <Card
        className={cx("w-full shadow-xl", wide ? "max-w-2xl" : "max-w-md")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-line">
          <h2 className="font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </Card>
    </div>
  );
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="text-faint mb-3">{icon}</div>}
      <div className="font-medium text-ink">{title}</div>
      {desc && <div className="text-sm text-muted mt-1 max-w-sm">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
