import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalContractClient from "./PortalContractClient";

interface ContractRow {
  id: string;
  contract_no: string;
  invoice_no: string;
  buyer_id: string | null;
  contract_date: string | null;
  line_items: unknown;
  current_stage: string;
}

interface FinanceRow {
  contract_id: string;
  payments_received: unknown;
}

interface ShippingRow {
  contract_id: string;
  etd: string | null;
  eta: string | null;
  atd: string | null;
  ata: string | null;
  carrier: string | null;
  vessel: string | null;
  voyage: string | null;
  bl_number: string | null;
  status: string | null;
}

interface DocumentRow {
  id: string;
  doc_type: string;
  file_name: string;
  file_size: number | null;
  uploaded_at: string;
}

export default async function PortalContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active) redirect("/login?error=disabled");
  if (profile.role !== "client") redirect("/");

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, contract_no, invoice_no, buyer_id, contract_date, line_items, current_stage")
    .eq("id", id)
    .maybeSingle();
  if (!contract) notFound();

  const { data: financeRow } = await supabase
    .from("contract_finance")
    .select("contract_id, payments_received")
    .eq("contract_id", id)
    .maybeSingle();

  const { data: shippingRow } = await supabase
    .from("contract_shipping")
    .select("contract_id, etd, eta, atd, ata, carrier, vessel, voyage, bl_number, status")
    .eq("contract_id", id)
    .maybeSingle();

  const { data: documentsData } = await supabase
    .from("contract_documents")
    .select("id, doc_type, file_name, file_size, uploaded_at")
    .eq("contract_id", id)
    .neq("doc_type", "ci-customs")
    .order("uploaded_at", { ascending: false });

  return (
    <PortalContractClient
      userId={user.id}
      contract={contract as ContractRow}
      finance={(financeRow as FinanceRow | null) ?? null}
      shipping={(shippingRow as ShippingRow | null) ?? null}
      documents={(documentsData ?? []) as DocumentRow[]}
    />
  );
}
