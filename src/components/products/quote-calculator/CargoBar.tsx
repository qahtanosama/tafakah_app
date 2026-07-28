"use client";

import type { ProductProfile } from "@/types/product";
import type { Cargo, CargoTotals } from "@/types/quote";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTAINER_TYPE } from "@/lib/quote/defaults";
import { qty } from "@/lib/money";
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
  return (
    <section
      aria-label="Shipment"
      className="rounded-xl bg-slate-50/80 ring-1 ring-foreground/10 dark:bg-white/[0.03]"
    >
      <div className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(11rem,1.4fr)_repeat(4,minmax(0,1fr))] lg:items-end">
        <label className="block">
          <FieldLabel>Product</FieldLabel>
          <Select value={cargo.productId} onValueChange={(v) => v && onChange({ productId: v })}>
            <SelectTrigger className="h-9 w-full bg-white text-sm font-medium dark:bg-zinc-800/60">
              <SelectValue placeholder="Select a product">{product?.name}</SelectValue>
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
          <FieldLabel>Containers</FieldLabel>
          <NumberField
            label="Number of containers"
            value={cargo.containers}
            onChange={(containers) => onChange({ containers })}
            step={1}
            min={1}
            placeholder="1"
          />
        </label>

        <label className="block">
          <FieldLabel>Cartons / container</FieldLabel>
          <NumberField
            label="Cartons per container"
            value={cargo.cartonsPerContainer}
            onChange={(cartonsPerContainer) => onChange({ cartonsPerContainer })}
            step={1}
          />
        </label>

        <label className="block">
          <FieldLabel>Net wt / carton</FieldLabel>
          <NumberField
            label="Net weight per carton in kilograms"
            value={cargo.nwPerCarton}
            onChange={(nwPerCarton) => onChange({ nwPerCarton })}
            step={0.1}
          />
        </label>

        <label className="block">
          <FieldLabel>Gross wt / carton</FieldLabel>
          <NumberField
            label="Gross weight per carton in kilograms"
            value={cargo.gwPerCarton}
            onChange={(gwPerCarton) => onChange({ gwPerCarton })}
            step={0.1}
          />
        </label>
      </div>

      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-foreground/10 px-4 py-2.5 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">Container</dt>
          <dd className="font-mono font-medium text-slate-700 dark:text-slate-200">{CONTAINER_TYPE}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">Cartons</dt>
          <dd className="font-mono font-medium tabular-nums text-slate-700 dark:text-slate-200">
            {qty(totals.cartons)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">Net weight</dt>
          <dd className="font-mono font-medium tabular-nums text-slate-700 dark:text-slate-200">
            {qty(totals.netKg)} KG
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 dark:text-slate-400">Quantity</dt>
          <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
            {qty(totals.qtyMTS, 2)} MT
          </dd>
        </div>
      </dl>
    </section>
  );
}
