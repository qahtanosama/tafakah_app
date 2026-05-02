import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { Providers } from "./providers";
import AuthBadge from "@/components/auth/AuthBadge";
import MigrationBanner from "@/components/migration/MigrationBanner";
import IdbCertWipe from "@/components/migration/IdbCertWipe";
import SyncStatusBadge from "@/components/retry-queue/SyncStatusBadge";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TAFAKAH Food - Trade Document Management",
  description: "Generate and manage export trade documents for TAFAKAH Food (Shanghai)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <IdbCertWipe />
          <ImpersonationBanner />
          <AuthBadge />
          <SyncStatusBadge />
          <MigrationBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
