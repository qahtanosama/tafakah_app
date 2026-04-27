import { useTranslations } from "next-intl";

export default function PortalFooter() {
  const t = useTranslations("portal.footer");
  return (
    <footer className="border-t bg-white py-6 text-center text-xs text-muted-foreground">
      <p>{t("copyright", { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
