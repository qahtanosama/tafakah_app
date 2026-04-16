import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, Package, Receipt, ScrollText } from "lucide-react";

const documentTypes = [
  {
    title: "Sales Contract",
    description: "Generate export sales contracts",
    icon: ScrollText,
  },
  {
    title: "Commercial Invoice",
    description: "Create commercial invoices for shipments",
    icon: Receipt,
  },
  {
    title: "Customs Invoice",
    description: "Prepare customs declaration invoices",
    icon: FileText,
  },
  {
    title: "Packing List",
    description: "Generate detailed packing lists",
    icon: Package,
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
                <Button variant="outline" disabled>
                  Coming Soon
                </Button>
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
