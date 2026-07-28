"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The compact inputs used inside the cost sheet and cargo bar. One place for
 * the field styling, which had been hand-copied onto ~20 elements.
 */
const FIELD =
  "h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-800/60 dark:text-slate-200";

interface NumberFieldProps {
  /** Also the accessible name — these fields sit in table cells with no visible label. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  placeholder?: string;
  className?: string;
}

/**
 * Numeric field over a `number` prop. Holds the raw string while focused so
 * partial input ("0.", "7.2") types naturally instead of being reformatted on
 * every keystroke, but the parent only ever sees a number.
 */
export function NumberField({
  label,
  value,
  onChange,
  step = 0.01,
  min = 0,
  placeholder = "0",
  className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      aria-label={label}
      placeholder={placeholder}
      value={draft ?? (value ? String(value) : "")}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parseFloat(e.target.value);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      onBlur={() => setDraft(null)}
      className={cn(FIELD, "text-right font-mono tabular-nums", className)}
    />
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}

/** Native select on purpose: compact, fast to operate, and free keyboard support. */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: SelectFieldProps<T>) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(FIELD, "cursor-pointer pr-1", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TextField({ label, value, onChange, placeholder, className }: TextFieldProps) {
  return (
    <input
      type="text"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD, className)}
    />
  );
}

/**
 * Label above a cargo-bar field. Sentence case, not tracked small-caps: these
 * are form labels, and stacking uppercase on every one of them turns a toolbar
 * into a wall of shouting.
 */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400", className)}>
      {children}
    </span>
  );
}
