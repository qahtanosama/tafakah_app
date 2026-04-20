import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, Database, FileSearch, FileText, Package, Users, ShoppingCart, Wallet, Calculator,
  Receipt, ScrollText, Settings, ArrowRight, PenLine, Merge,
} from "lucide-react";

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
    ],
  },
  {
    label: "Database",
    items: [
      { title: "Buyers", description: "Manage buyer/consignee database", icon: Users, href: "/buyers" },
      { title: "Products", description: "Product specs & pricing history", icon: ShoppingCart, href: "/products" },
      { title: "Quote Calculator", description: "Calculate pricing & profit margins", icon: Calculator, href: "/products/calculator" },
    ],
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      {/* Header */}
      <header className="w-full border-b bg-white shadow-sm dark:bg-zinc-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1B2A4A] text-sm font-bold text-white">T</div>
            <span className="text-lg font-bold tracking-tight">TAFAKAH Trade Hub</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-base text-zinc-500">Shanghai</span>
            <Link href="/settings" className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600" title="Settings">
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-[#1B2A4A] dark:text-white">
            Hello TAFAKAH
          </h1>
          <p className="mt-2 text-lg text-zinc-500">
            Export trade document management system
          </p>
        </div>

        {/* Quick actions */}
        <div className="mb-8 flex flex-wrap gap-3">
          <Link href="/master">
            <Button variant="outline" className="gap-2">
              <PenLine className="h-4 w-4" /> New Contract
            </Button>
          </Link>
          <Link href="/documents">
            <Button variant="outline" className="gap-2">
              <Merge className="h-4 w-4" /> Merge Package
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" /> Settings
            </Button>
          </Link>
        </div>

        {/* Master Data — hero card */}
        <Link href="/master" className="mb-8 block">
          <div className="group flex items-center justify-between rounded-xl border-2 border-[#1B2A4A]/20 bg-white p-6 shadow-sm transition-all duration-200 hover:border-[#1B2A4A]/40 hover:shadow-lg dark:bg-zinc-900">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#1B2A4A]/10 text-[#1B2A4A] dark:bg-zinc-800 dark:text-zinc-300">
                <Database className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Master Data Sheet</h2>
                <p className="mt-1 text-base text-zinc-500">Single source of truth &mdash; fill once, generate all documents</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-zinc-400 transition-transform duration-200 group-hover:translate-x-1" />
          </div>
        </Link>

        {/* Grouped card sections */}
        {sections.map((section) => (
          <div key={section.label} className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-zinc-500">{section.label}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((doc) => (
                <Link key={doc.title} href={doc.href}>
                  <div className="group flex h-full flex-col rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:scale-[1.02] dark:bg-zinc-900">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-[#1B2A4A]/10 group-hover:text-[#1B2A4A] dark:bg-zinc-800 dark:text-zinc-400">
                      <doc.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-semibold">{doc.title}</h3>
                    <p className="mt-1 flex-1 text-[0.938rem] text-zinc-500">{doc.description}</p>
                    <div className="mt-4 flex items-center text-sm font-medium text-[#1B2A4A] opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-400">
                      Open <ArrowRight className="ml-1 h-4 w-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </main>

      <footer className="mt-auto w-full border-t bg-white py-6 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl px-6 text-center text-base text-zinc-400">
          TAFAKAH Food (Shanghai) &mdash; Export Trade Solutions
        </div>
      </footer>
    </div>
  );
}
