import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  title: string;
  backHref?: string;
  backLabel?: string;
}

export default function AppHeader({ title, backHref = "/", backLabel = "Home" }: Props) {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/70 dark:bg-zinc-950/70 border-b border-slate-200/50 dark:border-white/10 transition-all duration-300">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6 lg:px-8">
        <Link
          href={backHref}
          className="group flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800 transition-all group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 group-hover:-translate-x-1">
            <ArrowLeft className="h-4 w-4" />
          </div>
          <span className="hidden sm:inline-block">{backLabel}</span>
        </Link>
        <div className="h-4 w-px bg-slate-200 dark:bg-zinc-800 mx-2"></div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
      </div>
    </header>
  );
}
