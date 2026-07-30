"use client";

import type { ProductProfile } from "@/types/product";
import type { Cargo, CargoTotals } from "@/types/quote";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PortCombobox from "@/components/ui/port-combobox";
import { CONTAINER_TYPE } from "@/lib/quote/defaults";
import { quoteTerms } from "@/lib/quote/quote-text";
import { qty } from "@/lib/money";
import { useT } from "@/lib/team-i18n";
import { FieldLabel, NumberField } from "./fields";

interface Props {
  products: ProductProfile[];
  product: ProductProfile | undefined;
  cargo: Cargo;
  totals: CargoTotals;
  onChange: (patch: Partial<Cargo>) => void;
}

/**
 * What is being shipped — one toolbar strip, five fields, and the quantities
 * they add up to. A toolbar rather than a card because it is the premise of the
 * screen, not one panel among several.
 *
 * Container type is stated, not chosen: ~99% of shipments are 40'HC, so the one
 * exception is not worth a control that every quote has to step past.
 */
export default function CargoBar({ products, product, cargo, totals, onChange }: Props) {
  const t = useT("calc");
  const terms = quoteTerms(cargo.loadingPort, cargo.dischargePort);

  return (
    <section
      aria-label={t("shipment")}
      className="rounded-xl bg-slate-50/80 ring-1 ring-foreground/10 dark:bg-white/[0.03]"
    >
      <div className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(11rem,1.4fr)_repeat(4,minmax(0,1fr))] lg:items-end">
        <label className="block">
          <FieldLabel>{t("product")}</FieldLabel>
          <Select value={cargo.productId} onValueChange={(v) => v && onChange({ productId: v })}>
            <SelectTrigger className="h-9 w-full bg-white text-sm font-medium dark:bg-zinc-800/60">
              <SelectValue placeholder={t("selectProduct")}>{product?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="block">
          <FieldLabel>{t("containers")}</FieldLabel>
          <NumberField
            label={t("containersA11y")}
            value={cargo.containers}
            onChange={(containers) => onChange({ containers })}
            step={1}
            min={1}
            placeholder="1"
          />
        </label>

        <label className="block">
          <FieldLabel>{t("boxesPerContainer")}</FieldLabel>
          <NumberField
            label={t("boxesPerContainerA11y")}
            value={cargo.cartonsPerContainer}
            onChange={(cartonsPerContainer) => onChange({ cartonsPerContainer })}
            step={1}
          />
        </label>

        <label className="block">
          <FieldLabel>{t("netWtPerCarton")}</FieldLabel>
          <NumberField
            label={t("netWtA11y")}
            value={cargo.nwPerCarton}
            onChange={(nwPerCarton) => onChange({ nwPerCarton })}
            step={0.1}
          />
        </label>

        <label className="block">
          <FieldLabel>{t("grossWtPerCarton")}</FieldLabel>
          <NumberField
            label={t("grossWtA11y")}
            value={cargo.gwPerCarton}
            onChange={(gwPerCarton) => onChange({ gwPerCarton })}
            step={0.1}
          />
        </label>
      </div>

      {/* The route decides what the quote says: "FOB Shekou" / "CIF Jeddah".
          A wrong destination is a factual error in a client-facing offer, so it
          is chosen per quote rather than inherited from a global default. */}
      <div className="grid gap-x-4 gap-y-3 border-t border-foreground/10 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <div>
          <FieldLabel>{t("loadingPort")}</FieldLabel>
          <PortCombobox
            value={cargo.loadingPort}
            onChange={(loadingPort) => onChange({ loadingPort })}
            ariaLabel={t("loadingPortA11y")}
            placeholder={t("loadingPortSearch")}
          />
        </div>
        <div>
          <FieldLabel>{t("dischargePort")}</FieldLabel>
          <PortCombobox
            value={cargo.dischargePort}
            onChange={(dischargePort) => onChange({ dischargePort })}
            ariaLabel={t("dischargePortA11y")}
            placeholder={t("dischargePortSearch")}
          />
        </div>
        {/* Which sailing the price is tied to. Required, because sea freight
            moves between sailings and a price with no departure is not an offer
            anyone can act on. */}
        <label className="block">
          <FieldLabel>{t("etd")}</FieldLabel>
          <input
            type="date"
            value={cargo.etd}
            aria-label={t("etdA11y")}
            onChange={(e) => onChange({ etd: e.target.value })}
            className="h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-800/60 dark:text-slate-200"
          />
        </label>
      </div>

      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-foreground/10 px-4 py-2.5 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">{t("container")}</dt>
          <dd className="font-mono font-medium text-slate-700 dark:text-slate-200">{CONTAINER_TYPE}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">{t("terms")}</dt>
          <dd className="font-medium text-slate-700 dark:text-slate-200">
            {terms.fob} / {terms.cif}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">{t("cartons")}</dt>
          <dd className="font-mono font-medium tabular-nums text-slate-700 dark:text-slate-200">
            {qty(totals.cartons)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">{t("netWeight")}</dt>
          <dd className="font-mono font-medium tabular-nums text-slate-700 dark:text-slate-200">
            {qty(totals.netKg)} KG
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">{t("quantity")}</dt>
          <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
            {qty(totals.qtyMTS, 2)} MT
          </dd>
        </div>
      </dl>
    </section>
  );
}
