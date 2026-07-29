"use client";

import { useCallback, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { FileDown, Loader2 } from "lucide-react";
import type { Quote } from "@/types/quote";
import { Button } from "@/components/ui/button";
import { saveBlobWithDownload, saveBlobWithPicker, supportsSaveFilePicker } from "@/lib/quick-share/save-file";
import PriceOfferPDF from "./PriceOfferPDF";

interface Props {
  productName: string;
  /** Product prefix from the products table, e.g. "GL" — used in the offer number. */
  productPrefix: string;
  containers: number;
  cartons: number;
  gwPerCarton: number;
  loadingPort: string;
  dischargePort: string;
  /** "carton" / "mesh bag" — pluralised for display. */
  packUnit: string;
  quote: Quote;
  disabled?: boolean;
}

/**
 * Renders the price offer to a PDF in the browser and saves it.
 *
 * The date and offer number are stamped at click time rather than during render
 * so the document is deterministic and two clicks a second apart cannot produce
 * two differently-numbered offers.
 */
export default function PriceOfferDownload({
  productName,
  productPrefix,
  containers,
  cartons,
  gwPerCarton,
  loadingPort,
  dischargePort,
  packUnit,
  quote,
  disabled,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      // Date-based, so the same product quoted twice in one day reuses the
      // number instead of inventing a sequence the contract log knows nothing about.
      const offerNo = `${productPrefix || "Q"}${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
        now.getDate()
      )}`;

      const blob = await pdf(
        <PriceOfferPDF
          data={{ offerNo, date, productName, containers, cartons, gwPerCarton, loadingPort, dischargePort, packUnit, quote }}
        />
      ).toBlob();

      const filename = `Offer_${offerNo}_${productName.replace(/\s+/g, "")}.pdf`;
      if (supportsSaveFilePicker()) {
        await saveBlobWithPicker(blob, filename);
      } else {
        await saveBlobWithDownload(blob, filename);
      }
    } catch (e) {
      setErr((e as Error).message || "Could not create the PDF");
    } finally {
      setBusy(false);
    }
  }, [productName, productPrefix, containers, cartons, gwPerCarton, loadingPort, dischargePort, packUnit, quote]);

  return (
    <>
      <Button variant="outline" size="sm" disabled={busy || disabled} onClick={onClick}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}
        {busy ? "Making PDF…" : "Offer PDF"}
      </Button>
      {err && (
        <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">
          {err}
        </p>
      )}
    </>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
