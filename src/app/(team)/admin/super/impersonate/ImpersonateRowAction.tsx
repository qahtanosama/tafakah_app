"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startImpersonation } from "@/lib/impersonation";

interface Props {
  userId: string;
  label: string;
  disabled?: boolean;
}

export function ImpersonateRowAction({ userId, label, disabled }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (disabled) return;
    if (
      !confirm(
        `You will preview the portal as ${label}.\n\n` +
          "All actions during this session are logged with your super-admin identity. Continue?",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await startImpersonation(userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(result.redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" disabled={disabled || isPending} onClick={onClick} className="gap-1">
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
        View as
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
