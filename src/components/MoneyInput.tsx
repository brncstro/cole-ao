"use client";

import { Field, inputCls } from "./ui";
import { centsToInput, parseMoney } from "@/lib/money";

export function MoneyInput({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <Field label={required ? `${label} *` : label} htmlFor={id} error={error} hint={hint} className={className}>
      <div className="relative">
        <input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={value}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={`${inputCls} pr-8 tabular`}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const p = parseMoney(value);
            if (p.ok && p.cents != null) onChange(centsToInput(p.cents));
          }}
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
          €
        </span>
      </div>
    </Field>
  );
}
