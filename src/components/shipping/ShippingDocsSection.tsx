"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  isValidContainerNumber,
  normalizeContainerNumber,
} from "@/lib/utils/container-number";
import {
  getContractContainers,
  getContractIdByNo,
  updateContractContainers,
} from "@/lib/contracts/update-shipping";
import type { ContractContainer } from "@/types/contract";

type Toast = { type: "success" | "error" | "info"; msg: string };

interface Props {
  contractNo: string;
  onSaved?: (next: { blNumber: string | null; containers: ContractContainer[] }) => void;
}

interface ContainerRow {
  id: string;
  value: string;
  error: string | null;
}

let rowSeq = 0;
function newRow(value = ""): ContainerRow {
  rowSeq += 1;
  return { id: `c-${rowSeq}`, value, error: null };
}

export default function ShippingDocsSection({ contractNo, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [contractId, setContractId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blNumber, setBlNumber] = useState("");
  const [rows, setRows] = useState<ContainerRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const idRes = await getContractIdByNo({ contractNo });
      if (cancelled) return;
      if (!idRes.ok) {
        setLoadError(idRes.error);
        setLoading(false);
        return;
      }
      setContractId(idRes.contractId);
      const dataRes = await getContractContainers({ contractId: idRes.contractId });
      if (cancelled) return;
      if (!dataRes.ok) {
        setLoadError(dataRes.error);
        setLoading(false);
        return;
      }
      setBlNumber(dataRes.blNumber ?? "");
      setRows(
        dataRes.containers.length > 0
          ? dataRes.containers.map((v) => newRow(v))
          : [newRow()],
      );
      // B/L + containers are read by the PDF generators directly from the
      // contract row (Supabase) — no localStorage snapshot mirror needed.

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contractNo]);

  const showToast = useCallback((type: Toast["type"], msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const updateRowValue = useCallback((id: string, raw: string) => {
    const upper = raw.toUpperCase();
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, value: upper, error: null } : r)),
    );
  }, []);

  const validateRowOnBlur = useCallback((id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const v = normalizeContainerNumber(r.value);
        if (!v) return { ...r, value: "", error: null };
        if (!isValidContainerNumber(v)) {
          return { ...r, value: v, error: "Format must be 4 letters + 7 digits (e.g., MSKU1234567)" };
        }
        return { ...r, value: v, error: null };
      }),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length === 0 ? [newRow()] : next;
    });
  }, []);

  const onSave = useCallback(async () => {
    if (!contractId) return;
    const normalized = rows.map((r) => normalizeContainerNumber(r.value)).filter((v) => v.length > 0);
    for (const v of normalized) {
      if (!isValidContainerNumber(v)) {
        showToast("error", `Invalid container number "${v}"`);
        return;
      }
    }
    setSaving(true);
    const trimmedBl = blNumber.trim() || null;
    const res = await updateContractContainers({
      contractId,
      blNumber: trimmedBl,
      containers: normalized,
    });
    setSaving(false);
    if (!res.ok) {
      showToast("error", res.error);
      return;
    }
    const unique = Array.from(new Set(normalized));
    const containerObjs: ContractContainer[] = unique.map((number) => ({ number }));
    // B/L + containers are persisted on the contract row via updateContractContainers
    // (a server action that can't touch the client cache), so invalidate the
    // contracts queries here — otherwise useContract serves a stale row and the
    // CI / PL / SC render without the freshly-saved B/L + containers.
    //
    // refetchType "all" is the key part: by default invalidateQueries only
    // refetches ACTIVE queries, but the CI/PL useContract query is INACTIVE
    // while we're on the Shipping page, so it would only be marked stale. "all"
    // forces the inactive query to refetch now, so the doc is fresh on arrival.
    // The ["contracts"] prefix already covers ["contracts", id] /
    // ["contracts","by-no",…]; the id-specific call is belt-and-suspenders.
    queryClient.invalidateQueries({ queryKey: ["contracts"], refetchType: "all" });
    if (contractId) {
      queryClient.invalidateQueries({ queryKey: ["contracts", contractId], refetchType: "all" });
    }

    // Reset row state to the canonical de-duped values.
    setRows(unique.length > 0 ? unique.map((v) => newRow(v)) : [newRow()]);
    setBlNumber(trimmedBl ?? "");

    onSaved?.({ blNumber: trimmedBl, containers: containerObjs });
    showToast("success", "✓ Shipping documents saved");
  }, [contractId, rows, blNumber, onSaved, showToast, queryClient]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{loadError}</p>
        </CardContent>
      </Card>
    );
  }

  const hasInvalidRow = rows.some((r) => r.error !== null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="bl-number">B/L Number</Label>
            <Input
              id="bl-number"
              value={blNumber}
              onChange={(e) => setBlNumber(e.target.value)}
              placeholder="e.g. SHFXXX12345"
            />
            <p className="mt-1 text-xs text-zinc-400">
              The Bill of Lading number for this contract. Shown on CI, PL and CI-Customs PDFs.
            </p>
          </div>

          <div>
            <Label>Container Numbers</Label>
            <div className="mt-1 space-y-2">
              {rows.map((row) => (
                <div key={row.id}>
                  <div className="flex items-center gap-2">
                    <Input
                      value={row.value}
                      onChange={(e) => updateRowValue(row.id, e.target.value)}
                      onBlur={() => validateRowOnBlur(row.id)}
                      placeholder="MSKU1234567"
                      maxLength={11}
                      aria-invalid={row.error !== null}
                      className="flex-1 font-mono uppercase"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(row.id)}
                      aria-label="Remove container"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {row.error && (
                    <p className="mt-1 text-xs text-red-600">{row.error}</p>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={addRow}
            >
              <Plus className="h-4 w-4" /> Add Container
            </Button>
            <p className="mt-2 text-xs text-zinc-400">
              Format: 4 letters + 7 digits (e.g. MSKU1234567). Duplicates are removed on save.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={saving || hasInvalidRow} className="gap-1">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : toast.type === "error"
              ? "border border-red-200 bg-red-50 text-red-800"
              : "border border-zinc-200 bg-white text-zinc-800 dark:bg-zinc-900"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
