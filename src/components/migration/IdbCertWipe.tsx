"use client";

import { useEffect } from "react";

/**
 * One-time cleanup: deletes the legacy `tafakah-documents` IndexedDB database
 * after certificate uploads were migrated to Supabase Storage.
 *
 * The wipe runs at most once per browser. On success we record a flag in
 * localStorage so subsequent loads short-circuit. We intentionally swallow
 * errors — if the user blocks IDB, has it locked open in another tab, or it
 * was already removed, the cert flow doesn't depend on this.
 */
const FLAG = "idb-certs-wiped-v1";

export default function IdbCertWipe() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(FLAG)) return;
    } catch {
      return;
    }
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      try {
        localStorage.setItem(FLAG, new Date().toISOString());
      } catch {
        /* private mode etc. — fine */
      }
    };
    try {
      const req = indexedDB.deleteDatabase("tafakah-documents");
      req.onsuccess = finish;
      req.onerror = finish;
      req.onblocked = () => {
        // Another tab still holds it open; leave the flag unset so we retry next load.
      };
    } catch {
      finish();
    }
  }, []);
  return null;
}
