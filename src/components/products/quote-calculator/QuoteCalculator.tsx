"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FxRates } from "@/types/quote";
import { useContracts } from "@/lib/data/contracts";
import { priceHistoryFor } from "@/lib/data/contract-analytics";
import { SCENARIO_MARGINS } from "@/lib/quote/defaults";
import { sendToMasterData } from "@/lib/quote/master-draft";
import { marginScenarios } from "@/lib/quote/pricing";
import { buildQuoteText } from "@/lib/quote/quote-text";
import CargoBar from "./CargoBar";
import CostSheet from "./CostSheet";
import FxPanel from "./FxPanel";
import PriceOfferDownload from "./PriceOfferDownload";
import PricePanel, { PriceHistory } from "./PricePanel";
import QuotePreview from "./QuotePreview";
import SessionHistory from "./SessionHistory";
import Toast from "./Toast";
import { useQuoteCalculator } from "./useQuoteCalculator";

const COPIED_MS = 2000;

/**
 * Quote Calculator — price a shipment, quote it, hand it to a contract.
 *
 * Three regions: what we are shipping (top), what it costs us (left), what we
 * sell it for (right, sticky). Math lives in lib/quote/pricing.ts and state in
 * useQuoteCalculator; this file wires them to the panels.
 */
export default function QuoteCalculator() {
  const calc = useQuoteCalculator();
  const { data: contractsData } = useContracts();

  const [fxOpen, setFxOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { cargo, product, quote, lang } = calc;

  const scenarios = useMemo(
    () => marginScenarios(quote.costPerMT, quote.totals, cargo.nwPerCarton, SCENARIO_MARGINS),
    [quote.costPerMT, quote.totals, cargo.nwPerCarton]
  );

  // Only the rates this quote actually depends on are worth surfacing.
  const usedCurrencies = useMemo(() => {
    const used = new Set(calc.lines.filter((l) => l.currency !== "USD").map((l) => l.currency));
    return [...used] as (keyof FxRates)[];
  }, [calc.lines]);

  const history = useMemo(() => {
    if (!product) return [];
    const entries = priceHistoryFor(contractsData ?? [], product.name);
    const latestByBuyer = new Map<string, { priceMT: number; date: string }>();
    for (const e of entries) {
      if (!latestByBuyer.has(e.buyer)) latestByBuyer.set(e.buyer, { priceMT: e.priceMT, date: e.date });
    }
    return [...latestByBuyer.entries()].slice(0, 5).map(([buyer, d]) => ({
      buyer,
      priceMT: d.priceMT,
      date: d.date,
      diffPct: d.priceMT > 0 ? ((quote.quotedPerMT - d.priceMT) / d.priceMT) * 100 : 0,
    }));
  }, [product, contractsData, quote.quotedPerMT]);

  const quoteText = useCallback(() => {
    if (!product) return "";
    return buildQuoteText({
      lang,
      productName: product.name,
      productNameAr: product.nameAr,
      containers: cargo.containers,
      cartonsPerContainer: cargo.cartonsPerContainer,
      gwPerCarton: cargo.gwPerCarton,
      loadingPort: cargo.loadingPort,
      dischargePort: cargo.dischargePort,
      packUnit: product.packUnit,
      packUnitAr: product.packUnitAr,
      quote,
    });
  }, [product, lang, cargo, quote]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    // Copy the edited text when the preview is open — that is the version the
    // user just read and adjusted.
    const text = previewOpen ? previewText : quoteText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setToast("Could not reach the clipboard — copy the text from Preview instead.");
    }
  }, [previewOpen, previewText, quoteText]);

  const handlePreview = useCallback(() => {
    setPreviewText(quoteText());
    setPreviewOpen(true);
  }, [quoteText]);

  const handleSendToMaster = useCallback(() => {
    if (!product) return;
    sendToMasterData({
      productName: product.name,
      hsCode: product.hsCode,
      nwPerCarton: cargo.nwPerCarton,
      gwPerCarton: cargo.gwPerCarton,
      cartonsPerContainer: cargo.cartonsPerContainer,
      containers: cargo.containers,
      loadingPort: cargo.loadingPort,
      dischargePort: cargo.dischargePort,
      // The to-the-cent figure, so the contract's carton price matches the
      // carton price the buyer actually agreed to.
      pricePerMT: quote.contractPerMT,
    });
    setToast("Sent to Master Data — open it to finish the contract.");
  }, [product, cargo, quote.contractPerMT]);

  if (calc.loading) return <CalculatorSkeleton />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8">
      <CargoBar
        products={calc.products}
        product={product}
        cargo={cargo}
        totals={quote.totals}
        onChange={calc.updateCargo}
      />

      {/* min-w-0 on both columns: without it the implicit grid column is sized
          `auto` by the widest child, so the cost table's min-width pushes the
          whole page into horizontal scroll on a phone instead of scrolling
          inside its own container. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,26rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <CostSheet
            lines={calc.lines}
            quote={quote}
            origin={calc.origin}
            reopenedFrom={calc.reopenedFrom}
            saving={calc.saving}
            saveError={calc.saveError}
            onUpdate={calc.updateLine}
            onAdd={calc.addLine}
            onRemove={calc.removeLine}
          />
          <FxPanel
            fx={calc.fx}
            onChange={calc.setFx}
            open={fxOpen}
            onToggle={() => setFxOpen((v) => !v)}
            usedCurrencies={usedCurrencies}
          />
          <SessionHistory
            sessions={calc.sessions}
            reopenedFrom={calc.reopenedFrom}
            onReopen={calc.reopenSession}
            onCloseReopened={calc.closeReopened}
          />
        </div>

        <div className="min-w-0 space-y-6 lg:sticky lg:top-20">
          <PricePanel
            quote={quote}
            scenarios={scenarios}
            marginPct={calc.marginPct}
            onMarginChange={calc.setMargin}
            fx={calc.fx}
            lang={lang}
            onLangChange={calc.setLang}
            onPreview={handlePreview}
            onCopy={handleCopy}
            onSendToMaster={handleSendToMaster}
            copied={copied && !previewOpen}
            offerPdf={
              product ? (
                <PriceOfferDownload
                  productName={product.name}
                  productPrefix={product.prefix}
                  containers={cargo.containers}
                  cartons={quote.totals.cartons}
                  gwPerCarton={cargo.gwPerCarton}
                  loadingPort={cargo.loadingPort}
                  dischargePort={cargo.dischargePort}
                  packUnit={product.packUnit}
                  quote={quote}
                  disabled={!quote.ready}
                />
              ) : null
            }
          />
          <PriceHistory rows={history} quotedPerMT={quote.quotedPerMT} />
        </div>
      </div>

      <QuotePreview
        open={previewOpen}
        lang={lang}
        text={previewText}
        onTextChange={setPreviewText}
        onCopy={handleCopy}
        onClose={() => setPreviewOpen(false)}
        copied={copied && previewOpen}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

/** Mirrors the real layout so the page does not reflow when data lands. */
function CalculatorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8" aria-busy="true">
      <span className="sr-only">Loading calculator…</span>
      <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,26rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <div className="h-80 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
        </div>
        <div className="h-96 min-w-0 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
      </div>
    </div>
  );
}
