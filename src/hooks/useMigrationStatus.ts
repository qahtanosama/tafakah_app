"use client";

import { useEffect, useState, useCallback } from "react";
import type { MigrationRun } from "@/lib/migration/types";
import { LAST_RUN_KEY, BANNER_DISMISS_KEY } from "@/lib/migration/types";
import {
  readProducts, readBuyers, readSellers,
  readContracts, readContractFinance, readContractShipping,
} from "@/lib/migration/localstorage-reader";

interface Status {
  hasLocalData: boolean;
  hasMigrated: boolean;
  lastRun: MigrationRun | null;
  shouldShowBanner: boolean;
}

function loadLastRun(): MigrationRun | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MigrationRun;
  } catch {
    return null;
  }
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(BANNER_DISMISS_KEY);
    if (!raw) return false;
    const until = parseInt(raw, 10);
    if (isNaN(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

function hasAnyLocalData(): boolean {
  try {
    if (readProducts().length > 0) return true;
    if (readBuyers().length > 0) return true;
    if (readSellers().length > 0) return true;
    if (readContracts().length > 0) return true;
    if (readContractFinance().length > 0) return true;
    if (readContractShipping().length > 0) return true;
  } catch {
    // ignore
  }
  return false;
}

export function useMigrationStatus(opts: { role?: "super_admin" | "team" | "client" | null } = {}): Status & {
  dismissBanner: (hours?: number) => void;
  setLastRun: (run: MigrationRun) => void;
  refresh: () => void;
} {
  const [state, setState] = useState<Status>({ hasLocalData: false, hasMigrated: false, lastRun: null, shouldShowBanner: false });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const lastRun = loadLastRun();
    const hasLocalData = hasAnyLocalData();
    const hasMigrated = lastRun?.status === "success";
    const dismissed = isDismissed();
    const shouldShowBanner = hasLocalData && !hasMigrated && !dismissed && (opts.role === "team" || opts.role === "super_admin");
    setState({ hasLocalData, hasMigrated, lastRun, shouldShowBanner });
  }, [opts.role, version]);

  const dismissBanner = useCallback((hours = 24) => {
    try {
      localStorage.setItem(BANNER_DISMISS_KEY, String(Date.now() + hours * 60 * 60 * 1000));
    } catch { /* ignore */ }
    setVersion((v) => v + 1);
  }, []);

  const setLastRun = useCallback((run: MigrationRun) => {
    try { localStorage.setItem(LAST_RUN_KEY, JSON.stringify(run)); } catch { /* ignore */ }
    setVersion((v) => v + 1);
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { ...state, dismissBanner, setLastRun, refresh };
}
