import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import QuoteCalculator from "@/components/products/QuoteCalculator";

export const metadata: Metadata = {
  title: "Quote Calculator \u2014 TAFAKAH Food",
  description: "Calculate pricing and profit margins for trade quotes",
};

export default function CalculatorPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Quote Calculator" backHref="/products" backLabel="Products" />
      <QuoteCalculator />
    </div>
  );
}
