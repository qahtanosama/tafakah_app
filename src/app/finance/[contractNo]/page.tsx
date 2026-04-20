import AppHeader from "@/components/ui/app-header";
import ContractFinanceDetail from "@/components/finance/ContractFinanceDetail";

export default async function FinanceDetailPage({ params }: { params: Promise<{ contractNo: string }> }) {
  const { contractNo } = await params;
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Contract Finance" backHref="/finance" backLabel="Finance" />
      <ContractFinanceDetail contractNo={decodeURIComponent(contractNo)} />
    </div>
  );
}
