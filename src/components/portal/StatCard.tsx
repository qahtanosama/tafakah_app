import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "navy",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: "navy" | "gold" | "muted";
}) {
  const accentClass =
    accent === "gold"
      ? "text-gold"
      : accent === "muted"
      ? "text-muted-foreground"
      : "text-navy";

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && <span className={accentClass}>{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${accentClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
