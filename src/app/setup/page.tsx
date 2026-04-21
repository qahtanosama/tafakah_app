import Link from "next/link";
import { isSetupNeeded } from "./actions";
import SetupForm from "./SetupForm";

export default async function SetupPage() {
  const needed = await isSetupNeeded();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
            <span className="text-lg font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">TAFAKAH Setup</h1>
          <p className="mt-1 text-sm text-slate-500">
            {needed ? "Create the first admin account" : "Setup already completed"}
          </p>
        </div>

        {needed ? (
          <SetupForm />
        ) : (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm dark:bg-zinc-900">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              An admin account already exists for this project.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
              Go to /login &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
