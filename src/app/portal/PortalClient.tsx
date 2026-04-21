"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function PortalClient({ fullName, email }: { fullName: string; email: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-white p-8 shadow-sm dark:bg-zinc-900">
        <div>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
            <span className="text-lg font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome, {fullName}</h1>
          <p className="mt-1 text-sm text-slate-500">{email}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Portal features coming soon.</p>
          <p className="mt-1 text-xs">
            You&rsquo;ll be able to view your active contracts, shipment status, and shared documents here.
          </p>
        </div>
        <form action="/logout" method="POST">
          <Button type="submit" variant="outline" className="w-full gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
