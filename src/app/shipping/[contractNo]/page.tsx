import AppHeader from "@/components/ui/app-header";
import ContractShippingDetail from "@/components/shipping/ContractShippingDetail";

export default async function ShippingDetailPage({ params }: { params: Promise<{ contractNo: string }> }) {
  const { contractNo } = await params;
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Shipment Details" backHref="/shipping" backLabel="Shipping" />
      <ContractShippingDetail contractNo={decodeURIComponent(contractNo)} />
    </div>
  );
}
