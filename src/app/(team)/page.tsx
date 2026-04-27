import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, Database, FileSearch, FileText, Package, Users, ShoppingCart, Wallet, Calculator,
  Receipt, ScrollText, Settings, ArrowRight, PenLine, Merge, Ship, Factory, Sparkles, ChevronRight
} from "lucide-react";
import ShippingCardSummary from "@/components/shipping/ShippingCardSummary";
import HomeStageWidget from "@/components/workflow/HomeStageWidget";

const sections = [
  {
    label: "Documents",
    items: [
      { title: "Sales Contract", description: "Generate export sales contracts", icon: ScrollText, href: "/sales-contract" },
      { title: "Commercial Invoice", description: "Create commercial invoices", icon: Receipt, href: "/commercial-invoice" },
      { title: "Customs Invoice", description: "Customs declaration invoices", icon: FileText, href: "/customs-invoice" },
      { title: "Packing List", description: "Generate packing lists", icon: Package, href: "/packing-list" },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Trade Documents", description: "Upload, classify & merge documents", icon: FileSearch, href: "/documents" },
      { title: "Contract Log", description: "View all submitted contracts", icon: ClipboardList, href: "/contract-log" },
      { title: "Finance & Payments", description: "Track costs, payments & profit", icon: Wallet, href: "/finance" },
      { title: "Shipping Tracker", description: "Track ETD, ETA, and vessel status", icon: Ship, href: "/shipping", summary: "shipping" as const },
    ],
  },
  {
    label: "Database",
    items: [
      { title: "Buyers", description: "Manage buyer/consignee database", icon: Users, href: "/buyers" },
      { title: "Sellers / Factories", description: "Manage factory & supplier database", icon: Factory, href: "/sellers" },
      { title: "Products", description: "Product specs & pricing history", icon: ShoppingCart, href: "/products" },
      { title: "Quote Calculator", description: "Calculate pricing & profit margins", icon: Calculator, href: "/products/calculator" },
    ],
  },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/50 via-white to-slate-50 dark:from-indigo-950/20 dark:via-zinc-950 dark:to-zinc-950"></div>
      <div className="fixed inset-0 -z-10 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] dark:opacity-[0.04]"></div>

      {/* Header (Glassmorphic) */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-white/70 dark:bg-zinc-950/70 border-b border-slate-200/50 dark:border-white/10 transition-all duration-300">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-4 group cursor-pointer">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white shadow-lg shadow-indigo-500/20 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-indigo-500/40">
              <span className="text-base font-bold">T</span>
              <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20"></div>
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              TAFAKAH
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Shanghai Hub</span>
            </div>
            <Link href="/settings" className="relative p-2 rounded-full text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all duration-300" title="Settings">
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 lg:px-8 py-12 flex-1 flex flex-col gap-12">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-4 border border-indigo-100 dark:border-indigo-500/20">
              <Sparkles className="h-4 w-4" /> Welcome back
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Trade Management <br className="hidden md:block"/>
              <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">Reimagined.</span>
            </h1>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <Link href="/master">
              <Button className="gap-2 h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 border-0">
                <PenLine className="h-4 w-4" /> New Contract
              </Button>
            </Link>
            <Link href="/documents">
              <Button variant="outline" className="gap-2 h-11 px-6 rounded-xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border-slate-200 dark:border-zinc-800 hover:bg-white dark:hover:bg-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-sm">
                <Merge className="h-4 w-4" /> Merge Package
              </Button>
            </Link>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
          <HomeStageWidget />
        </div>

        {/* Master Data Hero Card */}
        <Link href="/master" className="block animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
          <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-300 dark:hover:border-indigo-700/50">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 blur-3xl transition-opacity group-hover:opacity-100 opacity-50"></div>
            
            <div className="relative p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-900/20 border border-indigo-100 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <Database className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Master Data Sheet
                  </h2>
                  <p className="mt-2 text-slate-500 dark:text-slate-400 max-w-xl text-lg">
                    The central hub for your trade data. Fill out information once and seamlessly generate all required export documents.
                  </p>
                </div>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-50 dark:bg-zinc-800 text-slate-400 transition-all duration-300 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-indigo-600/30">
                <ChevronRight className="h-6 w-6 transition-transform duration-300 group-hover:translate-x-0.5" />
              </div>
            </div>
          </div>
        </Link>

        {/* Section Grid */}
        <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 fill-mode-both">
          {sections.map((section) => (
            <section key={section.label} className="relative">
              <div className="flex items-center gap-4 mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{section.label}</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-zinc-800 to-transparent"></div>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {section.items.map((doc) => (
                  <Link key={doc.title} href={doc.href} className="group flex h-full">
                    <div className="relative flex w-full flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 p-6 border border-slate-200 dark:border-zinc-800 shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-800">
                      
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-500 transition-all duration-300 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:scale-110">
                        <doc.icon className="h-6 w-6" strokeWidth={1.5} />
                      </div>
                      
                      <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {doc.title}
                      </h4>
                      
                      <p className="flex-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {doc.description}
                      </p>
                      
                      {"summary" in doc && doc.summary === "shipping" && (
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800">
                          <ShippingCardSummary />
                        </div>
                      )}
                      
                      <div className="mt-6 flex items-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                        Launch app <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md py-8">
        <div className="mx-auto flex max-w-7xl flex-col md:flex-row items-center justify-between px-6 lg:px-8 gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">T</div>
            <span className="text-sm font-medium text-slate-500">TAFAKAH Food (Shanghai)</span>
          </div>
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} Export Trade Solutions. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

