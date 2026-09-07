"use client";

import { useState } from "react";
import { Building2, Check, Loader2, Plus, Save, Star, Trash2, X } from "lucide-react";
import type { IssuingEntity } from "@/types/issuing-entity";
import { emptyIssuingEntity } from "@/types/issuing-entity";
import {
  useDeleteIssuingEntity,
  useIssuingEntities,
  useSaveIssuingEntity,
} from "@/lib/data/issuing-entities";
import { uploadEntityAsset } from "@/lib/storage/entity-assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The companies documents are issued under.
 *
 * Deliberately separate from Sellers / Factories: that screen manages the
 * suppliers we buy from. This one manages who the buyer's contract and invoice
 * are FROM, which is the name in every PDF letterhead.
 *
 * Two name fields, because the documents already print the company two ways —
 * the letterhead in title case, the contract clauses and signature block in
 * uppercase. Storing both is what lets a document look unchanged while the
 * source moves from a hardcoded block to a row.
 */
export default function EntityManager() {
  const { data, isLoading, isError, error } = useIssuingEntities();
  const save = useSaveIssuingEntity();
  const del = useDeleteIssuingEntity();
  const entities = data ?? [];

  const [editing, setEditing] = useState<IssuingEntity | null>(null);
  const [uploading, setUploading] = useState<"logo" | "stamp" | null>(null);
  const [uploadError, setUploadError] = useState("");

  const isNew = editing !== null && editing.id === "";

  function startNew() {
    setEditing({ ...emptyIssuingEntity(), addressLines: ["", "", ""], sortOrder: entities.length });
  }

  async function pickAsset(kind: "logo" | "stamp", file: File | undefined) {
    if (!file || !editing) return;
    setUploading(kind);
    setUploadError("");
    try {
      const url = await uploadEntityAsset(file);
      setEditing({ ...editing, [kind === "logo" ? "logoUrl" : "stampUrl"]: url });
    } catch (e) {
      setUploadError((e as Error).message || "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-zinc-500">Loading…</div>;
  }

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-semibold">Could not load companies.</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            Documents keep printing the built-in TAFAKAH letterhead, so nothing is blocked. If this
            is a fresh install, the issuing_entities migration may not have been run yet.
          </p>
          <p className="mt-2 font-mono text-xs text-slate-500">{(error as Error)?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
          The companies your documents go out under. The one marked default is used by every
          document that doesn&rsquo;t name another — contracts, invoices, packing lists and price
          offers.
        </p>
        <Button onClick={startNew} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Add company
        </Button>
      </div>

      <ul className="space-y-3">
        {entities.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/40"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="truncate font-semibold">{e.name}</span>
                {e.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Star className="h-3 w-3" aria-hidden="true" /> Default
                  </span>
                )}
              </div>
              {e.nameCn && <p className="mt-0.5 truncate text-sm text-slate-500">{e.nameCn}</p>}
              <p className="mt-0.5 truncate text-xs text-slate-500">{e.addressLines.join(" ")}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(e)}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={e.isDefault}
                title={e.isDefault ? "The default company cannot be deleted" : "Delete"}
                onClick={() => del.mutate(e.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
        {entities.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10">
            No companies yet. Documents are printing the built-in TAFAKAH letterhead.
          </li>
        )}
      </ul>

      {editing && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/40">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{isNew ? "New company" : editing.name}</h2>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name on the letterhead" hint="Title case, as it should print.">
              <Input
                value={editing.name}
                onChange={(ev) => setEditing({ ...editing, name: ev.target.value })}
                placeholder="e.g. NAWA FRESH Trading L.L.C."
              />
            </Field>
            <Field label="Chinese name" hint="Optional — printed under the name.">
              <Input
                value={editing.nameCn}
                onChange={(ev) => setEditing({ ...editing, nameCn: ev.target.value })}
                placeholder="泰福凯食品贸易（上海）有限公司"
              />
            </Field>

            <Field
              label="Address lines"
              hint="One per printed line, right-aligned in the header."
              full
            >
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Input
                    key={i}
                    value={editing.addressLines[i] ?? ""}
                    aria-label={`Address line ${i + 1}`}
                    placeholder={["Room 116, Building 1,", "258-288 Youdong Road,", "Minhang District, Shanghai, China"][i]}
                    onChange={(ev) => {
                      const lines = [...editing.addressLines];
                      while (lines.length < 3) lines.push("");
                      lines[i] = ev.target.value;
                      setEditing({ ...editing, addressLines: lines });
                    }}
                  />
                ))}
              </div>
            </Field>

            <Field label="Legal name" hint="Uppercase — used in contract clauses and the signature.">
              <Input
                value={editing.legalName}
                onChange={(ev) => setEditing({ ...editing, legalName: ev.target.value })}
                placeholder="NAWA FRESH TRADING L.L.C."
              />
            </Field>
            <Field label="Legal address" hint="Uppercase, one line.">
              <Input
                value={editing.legalAddress}
                onChange={(ev) => setEditing({ ...editing, legalAddress: ev.target.value })}
              />
            </Field>

            <Field label="Telephone">
              <Input
                value={editing.tel}
                onChange={(ev) => setEditing({ ...editing, tel: ev.target.value })}
                placeholder="+971 ..."
              />
            </Field>
            <Field label="Email">
              <Input
                value={editing.email}
                onChange={(ev) => setEditing({ ...editing, email: ev.target.value })}
              />
            </Field>

            <Field label="Logo" hint="PNG with a transparent background reads best.">
              <AssetPicker
                url={editing.logoUrl}
                busy={uploading === "logo"}
                onPick={(f) => pickAsset("logo", f)}
              />
            </Field>
            <Field label="Stamp" hint="Optional — printed over the signature line.">
              <AssetPicker
                url={editing.stampUrl}
                busy={uploading === "stamp"}
                onPick={(f) => pickAsset("stamp", f)}
              />
            </Field>

            <Field full>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isDefault}
                  onChange={(ev) => setEditing({ ...editing, isDefault: ev.target.checked })}
                  className="h-4 w-4"
                />
                <span>
                  Use this company by default
                  <span className="ml-1 text-slate-500">
                    — every document that doesn&rsquo;t name another
                  </span>
                </span>
              </label>
            </Field>
          </div>

          {uploadError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {uploadError}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={
                save.isPending ||
                !editing.name.trim() ||
                !editing.legalName.trim() ||
                !editing.legalAddress.trim()
              }
              onClick={() =>
                save.mutate(editing, {
                  onSuccess: () => setEditing(null),
                })
              }
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {isNew ? "Add company" : "Save changes"}
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}

function Field({
  label,
  hint,
  full,
  children,
}: {
  label?: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      {label && <Label className="mb-1.5 block text-sm font-semibold">{label}</Label>}
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function AssetPicker({
  url,
  busy,
  onPick,
}: {
  url: string;
  busy: boolean;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {url ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> set
        </span>
      ) : (
        <span className="text-xs text-slate-400">none</span>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => onPick(e.target.files?.[0])}
        className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold hover:file:bg-slate-200 dark:file:bg-zinc-800"
      />
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
    </div>
  );
}
