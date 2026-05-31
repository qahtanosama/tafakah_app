"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PortCombobox from "@/components/ui/port-combobox";
import BuyerCombobox from "@/components/ui/buyer-combobox";
import {
  Plus,
  Trash2,
  RotateCcw,
  Check,
  Send,
  CircleCheck,
  AlertTriangle,
  Upload,
  X,
  Wallet,
  Ship,
  Factory,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import QuickShareDialog, { QuickShareButton } from "@/components/quick-share/QuickShareDialog";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { SalesContractData, LineItem, Product, ContractTotals } from "@/types/sales-contract";
import {
  calcQtyMTS,
  calcPricePerCarton,
  calcTotals,
  createEmptyLineItem,
  getDefaultContractData,
  getPrefix,
} from "@/lib/sales-contract";

const DownloadAllButton = dynamic(
  () => import("./DownloadAllButton"),
  { ssr: false }
);
import {
  saveMasterData,
  loadMasterData,
  resetMasterData,
} from "@/lib/master-data";
import { useProducts } from "@/lib/data/products";
import { useBuyers, useSaveBuyer, createEmptyBuyer } from "@/lib/data/buyers";
import { useSellers, useSaveSeller, createEmptySeller } from "@/lib/data/sellers";
import { useSaveContract, useNextSequence, useContract, useEditContract } from "@/lib/data/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { Buyer } from "@/types/buyer";
import type { Seller } from "@/types/seller";
import SellerEditForm from "@/components/sellers/SellerEditForm";
import StageStrip from "@/components/workflow/StageStrip";

function NumInput({
  value,
  onChange,
  placeholder,
  className,
  step,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  className?: string;
  step?: string;
}) {
  return (
    <Input
      type="number"
      step={step ?? "any"}
      placeholder={placeholder}
      className={className}
      value={value === "" ? "" : value}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange("");
        } else {
          const n = parseFloat(raw);
          if (!isNaN(n)) onChange(n);
        }
      }}
    />
  );
}

const MAX_STAMP_SIZE = 2 * 1024 * 1024; // 2 MB

export default function MasterDataForm() {
  const { data: productsData } = useProducts();
  const productsList = productsData ?? [];
  const { data: buyersData } = useBuyers();
  const buyersList = buyersData ?? [];
  const { data: sellersData } = useSellers();
  const sellers = sellersData ?? [];
  const saveContractMut = useSaveContract();
  const saveBuyerMut = useSaveBuyer();
  const saveSellerMut = useSaveSeller();
  const qc = useQueryClient();

  // ── Super-admin edit mode (?edit=<contractId>) ──
  // Loads an existing contract's master_snapshot into this form and saves via
  // the audited editContract action. Contract & invoice numbers stay locked.
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const { data: editRow } = useContract(editId ?? undefined);
  const editContractMut = useEditContract();
  const editLoadedRef = useRef(false);
  const [lockedNumbers, setLockedNumbers] = useState<{ contractNo: string; invoiceNo: string } | null>(null);

  const [data, setData] = useState<SalesContractData>(getDefaultContractData);
  const [loaded, setLoaded] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [lastSubmit, setLastSubmit] = useState<{
    contractId: string;
    data: SalesContractData;
    totals: ContractTotals;
    contractNo: string;
    invoiceNo: string;
    dateSubmitted: string;
  } | null>(null);
  const [quickShareOpen, setQuickShareOpen] = useState(false);
  const [sellerEditing, setSellerEditing] = useState<Seller | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const firstProduct = data.lineItems[0]?.product || "";
  const firstProductObj = productsList.find((p) => p.name === firstProduct);
  const prefix = firstProductObj?.prefix || getPrefix(firstProduct);
  const year = data.identifiers.year;
  const sequence = data.identifiers.sequenceNumber;

  const contractNo = useMemo(
    () => {
      // Edit mode: the number is locked to the existing contract, never re-derived.
      if (isEditMode) return lockedNumbers?.contractNo ?? "";
      if (!prefix || !sequence) return "";
      return `${year}-${prefix}${sequence}`;
    },
    [isEditMode, lockedNumbers, year, sequence, prefix]
  );
  const invoiceNo = useMemo(
    () => {
      if (isEditMode) return lockedNumbers?.invoiceNo ?? "";
      if (!prefix || !sequence) return "";
      return `TAFA${year}${prefix}${sequence}`;
    },
    [isEditMode, lockedNumbers, year, sequence, prefix]
  );

  // Race-safe next sequence from Supabase (next_contract_sequence RPC).
  const { data: nextSeqData } = useNextSequence(year, prefix);

  useEffect(() => {
    // Edit mode loads from the contract row (below), not the local draft.
    if (isEditMode) return;
    const stored = loadMasterData();
    if (stored) setData(stored);
    setLoaded(true);
  }, [isEditMode]);

  // Edit mode: hydrate the form from the contract's frozen master_snapshot once,
  // and capture the locked contract / invoice numbers.
  useEffect(() => {
    if (!isEditMode || editLoadedRef.current) return;
    if (!editRow || !editRow.master_snapshot) return;
    setData(structuredClone(editRow.master_snapshot));
    setLockedNumbers({ contractNo: editRow.contract_no, invoiceNo: editRow.invoice_no });
    editLoadedRef.current = true;
    setLoaded(true);
  }, [isEditMode, editRow]);

  useEffect(() => {
    // Never auto-assign / bump the sequence while editing an existing contract.
    if (isEditMode) return;
    if (!loaded) return;
    if (typeof nextSeqData === "number" && nextSeqData > 0) {
      setData((prev) =>
        prev.identifiers.sequenceNumber === nextSeqData
          ? prev
          : { ...prev, identifiers: { ...prev.identifiers, sequenceNumber: nextSeqData } }
      );
    }
  }, [isEditMode, loaded, nextSeqData]);

  useEffect(() => {
    if (!loaded || productsList.length === 0) return;
    let changed = false;
    const newLineItems = data.lineItems.map(item => {
      if (item.product && !item.hsCode) {
        const profile = productsList.find(p => p.name === item.product);
        if (profile && profile.hsCode) {
          changed = true;
          return { ...item, hsCode: profile.hsCode };
        }
      }
      return item;
    });
    if (changed) {
      setData(prev => ({ ...prev, lineItems: newLineItems }));
    }
  }, [loaded, productsList, data.lineItems]);

  useEffect(() => {
    // Don't write the edited contract into the new-contract local draft.
    if (isEditMode) return;
    if (!loaded) return;
    saveMasterData(data);
    setShowSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setShowSaved(false), 1500);
  }, [data, loaded, isEditMode]);

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    },
    []
  );

  const update = useCallback(
    <K extends "identifiers" | "seller" | "buyer" | "shipping" | "bank" | "terms">(
      section: K,
      field: keyof SalesContractData[K],
      value: SalesContractData[K][typeof field]
    ) => {
      setData((prev) => ({
        ...prev,
        [section]: { ...prev[section], [field]: value },
      }));
    },
    []
  );

  const updateLineItem = useCallback(
    (id: string, field: keyof LineItem, value: LineItem[typeof field]) => {
      setData((prev) => ({
        ...prev,
        lineItems: prev.lineItems.map((item) => {
          if (item.id !== id) return item;
          const updated = { ...item, [field]: value };
          if (field === "product" && value) {
            const profile = productsList.find((p) => p.name === value);
            updated.hsCode = profile?.hsCode || "";
            if (profile) {
              updated.nwPerCarton = profile.defaultNW;
              updated.gwPerCarton = profile.defaultGW;
              if (updated.pricePerMT === "" || updated.pricePerMT === 0) {
                updated.pricePerMT = profile.defaultPriceMT;
              }
            }
          }
          updated.qtyMTS = calcQtyMTS(updated.nwPerCarton, updated.cartons);
          updated.pricePerCarton = calcPricePerCarton(
            updated.nwPerCarton,
            updated.pricePerMT
          );
          return updated;
        }),
      }));
    },
    [productsList]
  );

  const addRow = useCallback(() => {
    setData((prev) => {
      if (prev.lineItems.length >= 10) return prev;
      return {
        ...prev,
        lineItems: [...prev.lineItems, createEmptyLineItem()],
      };
    });
  }, []);

  const removeRow = useCallback((id: string) => {
    setData((prev) => {
      if (prev.lineItems.length <= 1) return prev;
      return {
        ...prev,
        lineItems: prev.lineItems.filter((i) => i.id !== id),
      };
    });
  }, []);

  const handleReset = useCallback(() => {
    const defaults = resetMasterData();
    setData(defaults);
  }, []);

  // Stamp upload
  const handleStampUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_STAMP_SIZE) {
        showToast("error", "Stamp image must be under 2 MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setData((prev) => ({
          ...prev,
          seller: { ...prev.seller, stamp: base64 },
        }));
      };
      reader.readAsDataURL(file);
      // Reset input so re-uploading the same file triggers onChange
      e.target.value = "";
    },
    [showToast]
  );

  const removeStamp = useCallback(() => {
    setData((prev) => ({
      ...prev,
      seller: { ...prev.seller, stamp: undefined },
    }));
  }, []);

  const canSubmit =
    firstProduct !== "" &&
    data.buyer.company.trim() !== "" &&
    year > 0 &&
    sequence > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !contractNo || !invoiceNo) return;

    const snapshot = structuredClone(data);
    const dateSubmitted = new Date().toISOString();

    // Supabase is the source of truth. saveContract owns the initial workflow
    // stage (docs-generated) and returns the canonical contract id.
    let contractId: string;
    try {
      const res = await saveContractMut.mutateAsync({ ...snapshot });
      contractId = res.contractId;
      qc.invalidateQueries({ queryKey: ["next-contract-sequence"] });
    } catch (err) {
      showToast("error", `⚠ Cloud save failed: ${(err as Error).message}`);
      return;
    }

    setLastSubmit({
      contractId,
      data: snapshot,
      totals: calcTotals(snapshot.lineItems, snapshot.terms?.numberOfContainers),
      contractNo,
      invoiceNo,
      dateSubmitted,
    });

    showToast("success", `\u2713 Contract ${contractNo} submitted and logged`);

    // Auto-save new buyer ONLY if neither (a) a UUID is already attached to the
    // form's buyer (selected from dropdown / pre-filled), nor (b) a match by
    // company name exists in the live buyers list. Trusting the id avoids
    // duplicate buyer rows when pre-fill carries a known buyer.
    const trimmedCompany = data.buyer.company.trim();
    const formBuyerId = data.buyer.id;
    const isUuid = typeof formBuyerId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formBuyerId);

    if (!isUuid && trimmedCompany) {
      const norm = trimmedCompany.toLowerCase();
      const matchInList = buyersList.find((b) => (b.company ?? "").trim().toLowerCase() === norm);
      if (!matchInList) {
        const newBuyer = createEmptyBuyer();
        newBuyer.company = trimmedCompany;
        newBuyer.address = data.buyer.address;
        newBuyer.additionalNumber = data.buyer.additionalNumber;
        newBuyer.cityPostal = data.buyer.cityPostal;
        newBuyer.country = data.buyer.country ?? "";
        newBuyer.email = data.buyer.email;
        newBuyer.ccEmail = data.buyer.ccEmail;
        saveBuyerMut.mutate({ payload: newBuyer, isUpdate: false }); // Supabase (source of truth)
      }
    } else if (!isUuid && formBuyerId) {
      // Form had a buyer.id but it isn't a UUID — likely a legacy local id that
      // never got relinked. Best-effort: fall through (no duplicate insert).
      console.warn("[MasterDataForm] buyer.id is not a UUID; auto-create skipped to prevent duplicates", formBuyerId);
    }

    // Bump the displayed sequence after a successful cloud save (refetches RPC).
    qc.invalidateQueries({ queryKey: ["next-contract-sequence"] });
  }, [
    canSubmit,
    contractNo,
    invoiceNo,
    data,
    firstProduct,
    showToast,
    buyersList,
    saveContractMut,
    saveBuyerMut,
    qc,
  ]);

  // Super-admin save: overwrite the existing contract's content + snapshot via
  // the audited editContract action. Numbers stay locked server-side too.
  const handleSaveEdit = useCallback(async () => {
    if (!isEditMode || !editId || !lockedNumbers || !canSubmit) return;
    const snapshot = structuredClone(data);
    try {
      await editContractMut.mutateAsync({ ...snapshot, id: editId });
    } catch (err) {
      showToast("error", `⚠ Save failed: ${(err as Error).message}`);
      return;
    }
    setLastSubmit({
      contractId: editId,
      data: snapshot,
      totals: calcTotals(snapshot.lineItems, snapshot.terms?.numberOfContainers),
      contractNo: lockedNumbers.contractNo,
      invoiceNo: lockedNumbers.invoiceNo,
      dateSubmitted: new Date().toISOString(),
    });
    showToast("success", `✓ Contract ${lockedNumbers.contractNo} updated`);
  }, [isEditMode, editId, lockedNumbers, canSubmit, data, editContractMut, showToast]);

  const fmt = (n: number, d = 2) => n.toFixed(d);
  // Contract-number uniqueness is enforced by the DB (unique constraint) and the
  // race-safe next_contract_sequence RPC, so no client-side duplicate check.
  const isDuplicate = false;

  // Editing a submitted contract is super-admin only (server also enforces this
  // in editContract via requireSuperAdmin — this is the matching UI gate).
  if (isEditMode && !authLoading && !isSuperAdmin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <h2 className="text-xl font-bold">Not authorized</h2>
        <p className="text-zinc-500">Editing a submitted contract requires super-admin access.</p>
        <Link href="/contract-log"><Button variant="outline" className="mt-2">Back to Contract Log</Button></Link>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Edit-mode banner */}
      {isEditMode && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Pencil className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Editing contract {lockedNumbers?.contractNo ?? "…"}
            </p>
            <p className="text-amber-700 dark:text-amber-300">
              All content is editable and corrections are saved to this contract and audit-logged.
              The <span className="font-medium">contract number</span> and{" "}
              <span className="font-medium">invoice number</span> are locked.
            </p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showSaved && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600 transition-opacity">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
        {!isEditMode && (
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </Button>
        )}
      </div>

      {/* ───── A) COMPANY INFO (Seller) ───── */}
      <Card>
        <CardHeader>
          <CardTitle>A) Company Info (Seller)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Company Name</Label>
            <Input
              value={data.seller.company}
              onChange={(e) => update("seller", "company", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={data.seller.address}
              onChange={(e) => update("seller", "address", e.target.value)}
            />
          </div>
          <div>
            <Label>Tel</Label>
            <Input
              value={data.seller.tel}
              onChange={(e) => update("seller", "tel", e.target.value)}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={data.seller.email}
              onChange={(e) => update("seller", "email", e.target.value)}
            />
          </div>

          {/* Stamp upload */}
          <div className="sm:col-span-2">
            <Label>Company Stamp (optional)</Label>
            <div className="mt-1 flex items-center gap-4">
              {data.seller.stamp ? (
                <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.seller.stamp}
                    alt="Stamp preview"
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeStamp}
                    className="absolute -top-1 -right-1 rounded-full bg-red-500 p-0.5 text-white shadow hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => stampInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {data.seller.stamp ? "Replace" : "Upload"}
                </Button>
                <input
                  ref={stampInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleStampUpload}
                />
                <p className="mt-1 text-xs text-zinc-400">
                  PNG with transparent background for best results. Max 2 MB.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───── A cont.) BANK DETAILS ───── */}
      <Card>
        <CardHeader>
          <CardTitle>A) Bank Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>SWIFT Code</Label>
            <Input
              value={data.bank.swift}
              onChange={(e) => update("bank", "swift", e.target.value)}
            />
          </div>
          <div>
            <Label>Beneficiary</Label>
            <Input
              value={data.bank.beneficiary}
              onChange={(e) => update("bank", "beneficiary", e.target.value)}
            />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input
              value={data.bank.account}
              onChange={(e) => update("bank", "account", e.target.value)}
            />
          </div>
          <div>
            <Label>Bank Name</Label>
            <Input
              value={data.bank.bank}
              onChange={(e) => update("bank", "bank", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Bank Address</Label>
            <Input
              value={data.bank.bankAddress}
              onChange={(e) => update("bank", "bankAddress", e.target.value)}
            />
          </div>
          <div>
            <Label>Post Code</Label>
            <Input
              value={data.bank.postCode}
              onChange={(e) => update("bank", "postCode", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ───── B) CONTRACT IDENTIFIERS ───── */}
      <Card>
        <CardHeader>
          <CardTitle>B) Contract Identifiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Year</Label>
              <NumInput
                value={data.identifiers.year}
                onChange={(v) => update("identifiers", "year", v)}
                step="1"
              />
            </div>
            <div>
              <Label>Prefix</Label>
              <Input
                value={prefix || "\u2014"}
                readOnly
                className="bg-zinc-50 font-mono dark:bg-zinc-800"
              />
            </div>
            <div>
              <Label>Sequence No.</Label>
              <Input
                value={sequence || "\u2014"}
                readOnly
                className="bg-zinc-50 font-mono dark:bg-zinc-800"
              />
            </div>
          </div>

          {firstProduct ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500">
                  Contract No.
                </p>
                <p className="text-xl font-bold tracking-tight">
                  {contractNo || "\u2014"}
                </p>
              </div>
              <div className="rounded-lg border bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500">Invoice No.</p>
                <p className="text-xl font-bold tracking-tight">
                  {invoiceNo || "\u2014"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              Select a product below to generate contract and invoice numbers.
            </p>
          )}

          {contractNo && (
            <div className="flex items-center gap-2 text-sm">
              {isEditMode ? (
                <>
                  <CircleCheck className="h-4 w-4 text-amber-500" />
                  <span className="text-amber-600">
                    Existing contract &mdash; number &amp; invoice locked
                  </span>
                </>
              ) : isDuplicate ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">Duplicate detected</span>
                </>
              ) : (
                <>
                  <CircleCheck className="h-4 w-4 text-emerald-500" />
                  <span className="text-emerald-600">
                    New contract &mdash; sequence auto-assigned
                  </span>
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Contract Date</Label>
              <Input
                type="date"
                value={data.identifiers.contractDate}
                onChange={(e) =>
                  update("identifiers", "contractDate", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={data.identifiers.invoiceDate}
                onChange={(e) =>
                  update("identifiers", "invoiceDate", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Seal Number</Label>
              <Input
                value={data.identifiers.sealNumber}
                onChange={(e) =>
                  update("identifiers", "sealNumber", e.target.value)
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Container Number</Label>
              <Input
                value={data.identifiers.containerNumber}
                onChange={(e) =>
                  update("identifiers", "containerNumber", e.target.value)
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>B/L Number</Label>
              <Input
                value={data.identifiers.blNumber}
                onChange={(e) =>
                  update("identifiers", "blNumber", e.target.value)
                }
                placeholder="Optional"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───── C) BUYER ───── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>C) Buyer / Consignee</CardTitle>
          <a href="/buyers" target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-600 hover:underline">Manage Buyers</a>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Select from saved buyers</Label>
            <BuyerCombobox
              buyers={buyersList}
              onSelect={(b) => {
                setData((prev) => ({
                  ...prev,
                  buyer: {
                    id: b.id,
                    company: b.company,
                    address: b.address,
                    additionalNumber: b.additionalNumber,
                    cityPostal: b.cityPostal,
                    email: b.email,
                    ccEmail: b.ccEmail,
                    country: b.country,
                  },
                }));
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Company Name</Label>
            <Input
              value={data.buyer.company}
              onChange={(e) => update("buyer", "company", e.target.value)}
              placeholder="Buyer company name"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={data.buyer.address}
              onChange={(e) => update("buyer", "address", e.target.value)}
              placeholder="Full address"
            />
          </div>
          <div>
            <Label>Additional Number</Label>
            <Input
              value={data.buyer.additionalNumber}
              onChange={(e) =>
                update("buyer", "additionalNumber", e.target.value)
              }
            />
          </div>
          <div>
            <Label>City & Postal</Label>
            <Input
              value={data.buyer.cityPostal}
              onChange={(e) => update("buyer", "cityPostal", e.target.value)}
              placeholder="City, Postal Code"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={data.buyer.email}
              onChange={(e) => update("buyer", "email", e.target.value)}
            />
          </div>
          <div>
            <Label>CC Email</Label>
            <Input
              type="email"
              value={data.buyer.ccEmail}
              onChange={(e) => update("buyer", "ccEmail", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ───── D) SHIPPING ───── */}
      <Card>
        <CardHeader>
          <CardTitle>D) Shipping & Delivery</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Loading Port</Label>
            <PortCombobox
              value={data.shipping.loadingPort}
              onChange={(v) => update("shipping", "loadingPort", v)}
            />
          </div>
          <div>
            <Label>Discharge Port</Label>
            <PortCombobox
              value={data.shipping.dischargePort}
              onChange={(v) => update("shipping", "dischargePort", v)}
              buyerAddress={data.buyer.address}
              placeholder="Select discharge port..."
            />
          </div>
          <div>
            <Label>Delivery From</Label>
            <Input
              type="date"
              value={data.shipping.deliveryFrom}
              onChange={(e) =>
                update("shipping", "deliveryFrom", e.target.value)
              }
            />
          </div>
          <div>
            <Label>Incoterm</Label>
            <Input
              value={data.shipping.incoterm}
              onChange={(e) => update("shipping", "incoterm", e.target.value)}
            />
          </div>
          <div>
            <Label>Origin</Label>
            <Input
              value={data.shipping.origin}
              onChange={(e) => update("shipping", "origin", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ───── E) LINE ITEMS ───── */}
      <Card>
        <CardHeader>
          <CardTitle>E) Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Product</TableHead>
                  <TableHead className="min-w-[100px]">HS Code</TableHead>
                  <TableHead className="min-w-[110px]">N.W./Ctn (kg)</TableHead>
                  <TableHead className="min-w-[110px]">G.W./Ctn (kg)</TableHead>
                  <TableHead className="min-w-[120px]">Cartons</TableHead>
                  <TableHead className="min-w-[100px]">Qty MTS</TableHead>
                  <TableHead className="min-w-[120px]">Price/MT ($)</TableHead>
                  <TableHead className="min-w-[100px]">Price/Ctn ($)</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Select
                        value={item.product}
                        onValueChange={(v) =>
                          updateLineItem(item.id, "product", v as Product)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {productsList.map((p) => (
                            <SelectItem key={p.id} value={p.name}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.hsCode}
                        readOnly
                        className="bg-zinc-50 dark:bg-zinc-800"
                      />
                    </TableCell>
                    <TableCell>
                      <NumInput
                        value={item.nwPerCarton}
                        onChange={(v) =>
                          updateLineItem(item.id, "nwPerCarton", v)
                        }
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell>
                      <NumInput
                        value={item.gwPerCarton}
                        onChange={(v) =>
                          updateLineItem(item.id, "gwPerCarton", v)
                        }
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell>
                      <NumInput
                        value={item.cartons}
                        onChange={(v) =>
                          updateLineItem(item.id, "cartons", v)
                        }
                        step="1"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">
                        {fmt(item.qtyMTS, 3)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <NumInput
                        value={item.pricePerMT}
                        onChange={(v) =>
                          updateLineItem(item.id, "pricePerMT", v)
                        }
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">
                        ${fmt(item.pricePerCarton)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(item.id)}
                        disabled={data.lineItems.length <= 1}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button
            variant="outline"
            className="mt-4"
            onClick={addRow}
            disabled={data.lineItems.length >= 10}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Row
          </Button>
        </CardContent>
      </Card>

      {/* ───── E2) SELLER / FACTORY ───── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-emerald-600" /> Factory supplying this product
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const lineProductIds = data.lineItems
              .map((i) => i.product ? productsList.find((p) => p.name === i.product)?.id : undefined)
              .filter((v): v is string => !!v);
            const uniqueProductIds = Array.from(new Set(lineProductIds));
            const matching = uniqueProductIds.length === 0
              ? []
              : sellers.filter((s) => s.products.some((pid) => uniqueProductIds.includes(pid)));
            const noneAssignedYet = sellers.length > 0 && matching.length === 0;
            const selected = data.sellerId ? sellers.find((s) => s.id === data.sellerId) : undefined;
            // If the stored sellerId doesn't supply any of the current products, still show it
            const options = (() => {
              if (matching.length > 0) return matching;
              // If nothing matches, show all sellers so user isn't blocked
              return sellers;
            })();

            return (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <Label>Seller / Factory (optional)</Label>
                    <Select
                      value={data.sellerId ?? "__none__"}
                      onValueChange={(v) => {
                        if (!v) return;
                        setData((prev) => ({ ...prev, sellerId: v === "__none__" ? undefined : v }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a factory..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">&mdash; None &mdash;</SelectItem>
                        {options.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.companyName} ({s.country})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const empty = createEmptySeller();
                        if (uniqueProductIds.length > 0) empty.products = [...uniqueProductIds];
                        setSellerEditing(empty);
                      }}
                      className="gap-1"
                    >
                      <Plus className="h-4 w-4" /> Add Seller
                    </Button>
                  </div>
                </div>
                {selected && (
                  <p className="text-xs text-zinc-500">
                    Contact: <span className="font-medium">{selected.contactName || "\u2014"}</span>
                    {selected.leadTimeDays != null && <span> &middot; Lead time: {selected.leadTimeDays} days</span>}
                    {selected.paymentTerms && <span> &middot; Terms: {selected.paymentTerms}</span>}
                    <span> &middot; </span>
                    <Link href={`/sellers?edit=${encodeURIComponent(selected.id)}`} className="text-emerald-600 underline">Edit</Link>
                  </p>
                )}
                {noneAssignedYet && !selected && (
                  <p className="text-xs text-amber-600">
                    No factory saved for the selected product{uniqueProductIds.length === 1 ? "" : "s"}. Use &ldquo;Add Seller&rdquo; to create one.
                  </p>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* ───── F) TERMS ───── */}
      <Card>
        <CardHeader>
          <CardTitle>F) Terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Brand</Label>
            <Input
              value={data.terms.brand}
              onChange={(e) => update("terms", "brand", e.target.value)}
            />
          </div>
          <div>
            <Label>Damage Allowance</Label>
            <Input
              value={data.terms.damageAllowance}
              onChange={(e) =>
                update("terms", "damageAllowance", e.target.value)
              }
            />
          </div>
          <div>
            <Label>Contract Valid To</Label>
            <Input
              type="date"
              value={data.terms.contractValidTo}
              onChange={(e) =>
                update("terms", "contractValidTo", e.target.value)
              }
            />
          </div>
          <div>
            <Label>Container Type</Label>
            <Input
              value={data.terms.containerType}
              onChange={(e) =>
                update("terms", "containerType", e.target.value)
              }
            />
          </div>
          <div>
            <Label>Number of Containers</Label>
            <NumInput
              value={data.terms.numberOfContainers ?? 1}
              onChange={(v) =>
                update("terms", "numberOfContainers", v)
              }
              step="1"
            />
          </div>
        </CardContent>
      </Card>

      {/* ───── SUBMIT ───── */}
      <div className="flex flex-col items-center gap-4 pb-8">
        <Button
          size="lg"
          className="gap-2 bg-emerald-600 px-8 py-6 text-lg font-bold text-white hover:bg-emerald-700"
          disabled={!canSubmit || isDuplicate || (isEditMode && editContractMut.isPending)}
          onClick={isEditMode ? handleSaveEdit : handleSubmit}
        >
          {isEditMode ? (
            <>
              <Check className="h-5 w-5" />
              {editContractMut.isPending ? "Saving…" : "Save Changes"}
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              Submit Contract
            </>
          )}
        </Button>
        {lastSubmit && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <DownloadAllButton
                data={lastSubmit.data}
                totals={lastSubmit.totals}
                contractNo={lastSubmit.contractNo}
                invoiceNo={lastSubmit.invoiceNo}
              />
              <QuickShareButton size="lg" onClick={() => setQuickShareOpen(true)} />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm dark:bg-zinc-900">
              <span className="text-zinc-500">Next steps for {lastSubmit.contractNo}:</span>
              <Link href={`/finance/${encodeURIComponent(lastSubmit.contractNo)}`}>
                <Button variant="outline" size="sm" className="gap-1"><Wallet className="h-4 w-4" /> Add costs</Button>
              </Link>
              <Link href={`/shipping/${encodeURIComponent(lastSubmit.contractNo)}`}>
                <Button variant="outline" size="sm" className="gap-1"><Ship className="h-4 w-4" /> Add shipping details</Button>
              </Link>
              <span className="text-xs text-zinc-400">(or come back later)</span>
            </div>

            {/* Workflow stage tracker */}
            <div className="w-full max-w-5xl rounded-lg border bg-white p-4 dark:bg-zinc-900">
              <p className="mb-3 text-sm font-semibold text-zinc-600">Workflow</p>
              <StageStrip contractId={lastSubmit.contractId} />
            </div>
          </>
        )}
      </div>

      {lastSubmit && (
        <QuickShareDialog
          open={quickShareOpen}
          onClose={() => setQuickShareOpen(false)}
          contract={({
            id: lastSubmit.contractId,
            contractNo: lastSubmit.contractNo,
            invoiceNo: lastSubmit.invoiceNo,
            dateSubmitted: lastSubmit.dateSubmitted,
            buyer: lastSubmit.data.buyer.company,
            product: lastSubmit.data.lineItems[0]?.product || "",
            status: "Active",
            masterSnapshot: lastSubmit.data,
            sellerId: lastSubmit.data.sellerId,
            workflow: lastSubmit.data.workflow,
          }) as ContractLogEntry}
        />
      )}

      {sellerEditing && (
        <SellerEditForm
          open={!!sellerEditing}
          initial={sellerEditing}
          products={productsList}
          existingIds={sellers.map((s) => s.id)}
          onSave={async (s) => {
            // Supabase generates its own UUID on insert — use the returned row's
            // id so the contract's sellerId matches the persisted seller.
            let persisted = s;
            try {
              const saved = await saveSellerMut.mutateAsync({ payload: s, isUpdate: false });
              if (saved && typeof saved === "object" && "id" in saved) persisted = saved as Seller;
            } catch (err) {
              showToast("error", `⚠ Cloud save failed: ${(err as Error).message}`);
            }
            setData((prev) => ({ ...prev, sellerId: persisted.id }));
            setSellerEditing(null);
          }}
          onCancel={() => setSellerEditing(null)}
        />
      )}
    </div>
  );
}
