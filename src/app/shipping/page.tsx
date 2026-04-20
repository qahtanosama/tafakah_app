import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import ShippingOverview from "@/components/shipping/ShippingOverview";

export const metadata: Metadata = {
  title: "Shipping Tracker \u2014 TAFAKAH Food",
  description: "Track ETD, ETA, and vessel status across all shipments",
};

export default function ShippingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Shipping Tracker" />
      <ShippingOverview />
    </div>
  );
}
