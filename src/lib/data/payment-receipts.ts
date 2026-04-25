"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  uploadReceipt,
  listReceipts,
  archiveReceipt,
} from "@/lib/storage/payment-receipts";
import type { PaymentReceipt } from "@/types/payment-receipt";

const key = (contractId: string, paymentId: string | undefined) =>
  ["payment-receipts", contractId, paymentId] as const;

export function useReceipts(contractId: string, paymentId: string | undefined) {
  return useQuery({
    queryKey: key(contractId, paymentId),
    queryFn: () => listReceipts(contractId, paymentId!),
    enabled: !!paymentId,
    staleTime: 30_000,
  });
}

export function useUploadReceipt(
  contractId: string,
  paymentId: string,
  role: "team" | "client",
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadReceipt(contractId, paymentId, file, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(contractId, paymentId) }),
  });
}

export function useArchiveReceipt(contractId: string, paymentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, storagePath }: { id: string; storagePath: string }) =>
      archiveReceipt(id, storagePath),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: key(contractId, paymentId) });
      const previous = qc.getQueryData<PaymentReceipt[]>(key(contractId, paymentId));
      qc.setQueryData<PaymentReceipt[]>(key(contractId, paymentId), (old) =>
        (old ?? []).filter((r) => r.id !== id),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key(contractId, paymentId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(contractId, paymentId) }),
  });
}
