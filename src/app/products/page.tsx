import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import ProductManager from "@/components/products/ProductManager";

export const metadata: Metadata = {
  title: "Products \u2014 TAFAKAH Food",
  description: "Product specs and pricing history",
};

export default function ProductsPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Product Database" />
      <ProductManager />
    </div>
  );
}
