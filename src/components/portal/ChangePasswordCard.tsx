"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { changePassword } from "@/app/(portal)/[locale]/portal/profile/actions";

export default function ChangePasswordCard() {
  const t = useTranslations("portal.profile");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (next !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    startTransition(async () => {
      const res = await changePassword(current, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      reset();
      setOpen(false);
      setTimeout(() => setSuccess(false), 4000);
    });
  }

  if (!open) {
    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center rounded-md border border-navy bg-white px-4 text-sm font-medium text-navy transition-colors hover:bg-navy hover:text-white"
        >
          {t("changePassword")}
        </button>
        {success && (
          <p className="mt-2 text-sm text-emerald-700">{t("passwordChanged")}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-portal-bg p-4">
      <PasswordField
        label={t("currentPassword")}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <PasswordField
        label={t("newPassword")}
        value={next}
        onChange={setNext}
        autoComplete="new-password"
      />
      <PasswordField
        label={t("confirmNewPassword")}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !current || !next || !confirm}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-navy px-4 text-sm font-medium text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("save")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md border bg-white px-4 text-sm font-medium hover:bg-muted"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="mt-1 block h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
      />
    </label>
  );
}
