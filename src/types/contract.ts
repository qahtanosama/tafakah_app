/**
 * DB-shape Contract row.
 *
 * Mirrors the columns on `public.contracts`. Use this for server-side reads
 * (portal page, server actions). The local-storage / form-state shape is in
 * `sales-contract.ts` (`SalesContractData`, `ContractLogEntry`).
 */

export type ContractContainer = {
  /** Container number, e.g. "MSKU1234567". 4 letters + 7 digits, uppercase. */
  number: string;
};

export interface Contract {
  id: string;
  contract_no: string;
  invoice_no: string;
  buyer_id?: string | null;
  seller_id?: string | null;
  contract_date?: string | null;
  current_stage: string;
  bl_number?: string | null;
  containers?: ContractContainer[];
}
