import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import QuoteCalculator from "@/components/products/QuoteCalculator";

export const metadata: Metadata = {
  title: "Quote Calculator \u2014 TAFAKAH Food",
  description: "Calculate pricing and profit margins for trade quotes",
};

export default function CalculatorPage() {
  return (
    <div className="flex flex-col min-h-screen relative font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/50 via-white to-slate-50 dark:from-indigo-950/20 dark:via-zinc-950 dark:to-zinc-950"></div>
      <div className="fixed inset-0 -z-10 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] dark:opacity-[0.04]"></div>

      <AppHeader title="Quote Calculator" backHref="/products" backLabel="Products" />
      <main className="flex-1 w-full max-w-7xl mx-auto py-6">
        <QuoteCalculator />
      </main>
    </div>
  );
}
