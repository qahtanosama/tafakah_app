"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { endImpersonation } from "@/lib/impersonation";

export function ExitImpersonationButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await endImpersonation();
          router.replace(result.ok ? result.redirectTo : "/admin/super");
          router.refresh();
        });
      }}
      className="inline-flex items-center gap-1.5 rounded border border-amber-700 bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-300 disabled:opacity-60"
    >
      {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      Exit impersonation
    </button>
  );
}
