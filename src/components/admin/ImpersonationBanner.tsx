import { getActiveImpersonation } from "@/lib/impersonation";
import { ExitImpersonationButton } from "./ExitImpersonationButton";
import { EyeOff } from "lucide-react";

/**
 * Renders a fixed yellow banner across the top of the app whenever the current
 * super_admin is actively impersonating a client. Returns null otherwise so it
 * has zero impact on regular users.
 */
export default async function ImpersonationBanner() {
  const ctx = await getActiveImpersonation();
  if (!ctx) return null;

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-400 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-sm">
      <div className="flex items-center gap-2">
        <EyeOff className="h-4 w-4" />
        <span>
          <strong>Impersonating</strong>: {ctx.targetEmail ?? ctx.targetFullName ?? ctx.targetUserId}
          <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase">client</span>
        </span>
        <span className="hidden text-xs text-amber-800 sm:inline">— actions logged</span>
      </div>
      <ExitImpersonationButton />
    </div>
  );
}
