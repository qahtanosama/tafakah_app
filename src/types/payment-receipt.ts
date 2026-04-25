export type PaymentReceipt = {
  id: string;
  contractId: string;
  paymentId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  uploadedAt: string;
  uploadedBy?: string;
  uploadedByRole: "team" | "client";
  isArchived: boolean;
};
