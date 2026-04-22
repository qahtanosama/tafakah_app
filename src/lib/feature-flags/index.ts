"use client";

import { useEffect, useState, useCallback } from "react";

export type FeatureFlag =
  | "products-db"
  | "buyers-db"
  | "sellers-db"
  | "contracts-read-db"
  | "contracts-write-db"
  | "workflow-db"
  | "finance-db"
  | "shipping-db"
  | "documents-db"
  | "quick-share-db";

export interface FlagMeta {
  label: string;
  description: string;
  group: string;
  /** When true, the Settings UI renders the toggle but disables it (feature not ready yet). */
  disabled?: boolean;
}

export const FLAG_METADATA: Record<FeatureFlag, FlagMeta> = {
  "products-db":        { label: "Products",          description: "Read/write products from Supabase",     group: "Databases" },
  "buyers-db":          { label: "Buyers",            description: "Read/write buyers from Supabase",       group: "Databases" },
  "sellers-db":         { label: "Sellers",           description: "Read/write sellers from Supabase",      group: "Databases" },
  "contracts-read-db":  { label: "Contracts (read)",  description: "Contract Log reads from Supabase",      group: "Contracts", disabled: true },
  "contracts-write-db": { label: "Contracts (write)", description: "Master Data submit writes to Supabase", group: "Contracts", disabled: true },
  "workflow-db":        { label: "Workflow stages",   description: "Stage advancement stored in Supabase",  group: "Contracts", disabled: true },
  "finance-db":         { label: "Finance",           description: "Cost items + payments from Supabase",   group: "Operations", disabled: true },
  "shipping-db":        { label: "Shipping",          description: "Shipping tracker from Supabase",        group: "Operations", disabled: true },
  "documents-db":       { label: "Trade documents",   description: "Document metadata from Supabase",       group: "Operations", disabled: true },
  "quick-share-db":     { label: "Quick Share",       description: "Quick Share reads from Supabase",       group: "Operations", disabled: true },
};

export const FLAG_GROUPS = ["Databases", "Contracts", "Operations"] as const;

const STORAGE_KEY = "feature-flags";
const EVENT_NAME = "feature-flags-changed";

function readAll(): Record<string, boolean> {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function getFlag(flag: FeatureFlag): boolean {
  return readAll()[flag] === true;
}

export function setFlag(flag: FeatureFlag, value: boolean): void {
  const all = readAll();
  all[flag] = value;
  writeAll(all);
}

export function useFeatureFlag(flag: FeatureFlag): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(false);

  useEffect(() => {
    setValue(getFlag(flag));
    function refresh() { setValue(getFlag(flag)); }
    window.addEventListener(EVENT_NAME, refresh);
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) refresh(); };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [flag]);

  const set = useCallback((v: boolean) => {
    setFlag(flag, v);
    setValue(v);
  }, [flag]);

  return [value, set];
}

export function useAllFlags(): Record<FeatureFlag, boolean> {
  const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>(() => {
    const all = readAll() as Record<string, boolean>;
    const out = {} as Record<FeatureFlag, boolean>;
    (Object.keys(FLAG_METADATA) as FeatureFlag[]).forEach((k) => { out[k] = !!all[k]; });
    return out;
  });

  useEffect(() => {
    function refresh() {
      const all = readAll();
      const next = {} as Record<FeatureFlag, boolean>;
      (Object.keys(FLAG_METADATA) as FeatureFlag[]).forEach((k) => { next[k] = !!all[k]; });
      setFlags(next);
    }
    window.addEventListener(EVENT_NAME, refresh);
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) refresh(); };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return flags;
}
