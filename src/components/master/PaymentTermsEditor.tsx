"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  DEPOSIT_TIMINGS,
  DEFAULT_PAYMENT_TERMS,
  composePaymentTerms,
  parsePaymentTerms,
  portFromDischarge,
  type StandardPaymentTerms,
} from "@/lib/payment-terms";

/**
 * Structured editor for the Sales Contract payment terms (clause 6).
 *
 * The STORED value stays a single plain string on terms.paymentTerms — this
 * component is UI sugar over lib/payment-terms: fill the blanks (percentage,
 * deposit timing, port, days) and the standard two-part sentence writes
 * itself; balance % is always 100 − advance. Anything that doesn't match the
 * pattern (old contracts, special deals) opens in free-text mode.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Current discharge port from the Shipping section — offers a one-click port fill. */
  dischargePort?: string;
}

export default function PaymentTermsEditor({ value, onChange, dischargePort }: Props) {
  // Mode is decided once from the incoming value (empty → standard defaults);
  // afterwards the user drives it via the toggle.
  const initial = useMemo(
    () => (value.trim() === "" ? DEFAULT_PAYMENT_TERMS : parsePaymentTerms(value)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [mode, setMode] = useState<"standard" | "free">(initial ? "standard" : "free");
  const [fields, setFields] = useState<StandardPaymentTerms>(initial ?? DEFAULT_PAYMENT_TERMS);

  function apply(next: StandardPaymentTerms) {
    setFields(next);
    onChange(composePaymentTerms(next));
  }

  function switchMode(next: "standard" | "free") {
    setMode(next);
    if (next === "standard") {
      // Re-parse whatever is stored; fall back to the last structured fields.
      const parsed = parsePaymentTerms(value) ?? fields;
      apply(parsed);
    }
  }

  const suggestedPort = dischargePort ? portFromDischarge(dischargePort) : "";
  const composed = composePaymentTerms(fields);

  return (
    <div className="sm:col-span-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Payment Terms (clause 6 on the Sales Contract)</Label>
        <button
          type="button"
          onClick={() => switchMode(mode === "standard" ? "free" : "standard")}
          className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          {mode === "standard" ? "Edit as free text" : "Use standard 50/50 terms"}
        </button>
      </div>

      {mode === "free" ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='e.g. "100% T/T before shipment"'
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
        />
      ) : (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            <div>
              <Label className="text-xs text-zinc-500">Advance %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={fields.advancePct}
                onChange={(e) => {
                  const n = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                  apply({ ...fields, advancePct: n });
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-500">Deposit due</Label>
              <Select
                value={fields.depositTiming}
                onValueChange={(v) => apply({ ...fields, depositTiming: v ?? fields.depositTiming })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPOSIT_TIMINGS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                  {!DEPOSIT_TIMINGS.includes(fields.depositTiming as (typeof DEPOSIT_TIMINGS)[number]) && (
                    <SelectItem value={fields.depositTiming}>{fields.depositTiming}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[7rem_1fr_10rem]">
            <div>
              <Label className="text-xs text-zinc-500">Balance %</Label>
              <Input value={`${100 - fields.advancePct}%`} readOnly className="bg-zinc-100 dark:bg-zinc-800" />
            </div>
            <div>
              <Label className="text-xs text-zinc-500">Before arrival at</Label>
              <div className="flex gap-2">
                <Input
                  value={fields.port}
                  placeholder="Jeddah Port"
                  onChange={(e) => apply({ ...fields, port: e.target.value })}
                />
                {suggestedPort && suggestedPort !== fields.port && (
                  <button
                    type="button"
                    onClick={() => apply({ ...fields, port: suggestedPort })}
                    className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    title={`Fill from discharge port: ${suggestedPort}`}
                  >
                    Use {suggestedPort}
                  </button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-zinc-500">Within</Label>
              <Input
                value={fields.balanceDays}
                placeholder="7–10 days"
                onChange={(e) => apply({ ...fields, balanceDays: e.target.value })}
              />
            </div>
          </div>

          <p className="whitespace-pre-line rounded-md bg-white px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            {composed}
          </p>
        </div>
      )}
    </div>
  );
}
