import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  title: string;
  backHref?: string;
  backLabel?: string;
}

export default function AppHeader({ title, backHref = "/", backLabel = "Home" }: Props) {
  return (
    <header className="sticky top-0 z-10 w-full border-b bg-white shadow-sm dark:bg-zinc-900">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-base text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>
    </header>
  );
}
