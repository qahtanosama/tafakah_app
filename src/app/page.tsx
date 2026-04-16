import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClipboardList, Database, FileText, Package, Receipt, ScrollText } from "lucide-react";

const documentTypes = [
  {
    title: "Sales Contract",
    description: "Generate export sales contracts",
    icon: ScrollText,
    href: "/sales-contract",
    ready: true,
  },
  {
    title: "Commercial Invoice",
    description: "Create commercial invoices for shipments",
    icon: Receipt,
    href: "#",
    ready: false,
  },
  {
    title: "Customs Invoice",
    description: "Prepare customs declaration invoices",
    icon: FileText,
    href: "#",
    ready: false,
  },
  {
    title: "Packing List",
    description: "Generate detailed packing lists",
    icon: Package,
    href: "#",
    ready: false,
  },
  {
    title: "Contract Log",
    description: "View all submitted contracts",
    icon: ClipboardList,
    href: "/contract-log",
    ready: true,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="w-full border-b bg-white dark:bg-zinc-900">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-xl font-bold tracking-tight">TAFAKAH Food</h1>
          <span className="text-sm text-zinc-500">Shanghai</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold tracking-tight">
            Hello TAFAKAH
          </h2>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            Export trade document management system
          </p>
        </div>

        {/* Master Data — hero card */}
        <Link href="/master" className="mb-6 block">
          <Card className="border-2 border-zinc-300 transition-shadow hover:shadow-lg dark:border-zinc-600">
            <CardHeader className="flex flex-row items-center gap-4">
              <Database className="h-10 w-10 text-zinc-700 dark:text-zinc-300" />
              <div className="flex-1">
                <CardTitle className="text-lg">Master Data Sheet</CardTitle>
                <CardDescription>
                  Single source of truth — fill once, generate all documents
                </CardDescription>
              </div>
              <Button variant="default" size="lg">
                Open
              </Button>
            </CardHeader>
          </Card>
        </Link>

        <div className="grid gap-6 sm:grid-cols-2">
          {documentTypes.map((doc) => (
            <Card key={doc.title} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center gap-4">
                <doc.icon className="h-8 w-8 text-zinc-700 dark:text-zinc-300" />
                <div>
                  <CardTitle>{doc.title}</CardTitle>
                  <CardDescription>{doc.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {doc.ready ? (
                  <Link href={doc.href}>
                    <Button variant="default">Open</Button>
                  </Link>
                ) : (
                  <Button variant="outline" disabled>
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <footer className="mt-auto w-full border-t bg-white py-6 dark:bg-zinc-900">
        <div className="mx-auto max-w-5xl px-6 text-center text-sm text-zinc-500">
          TAFAKAH Food (Shanghai) &mdash; Export Trade Solutions
        </div>
      </footer>
    </div>
  );
}
