import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SessionGuard } from "@/components/SessionGuard";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Bestemmingsbord",
  description: "Alle bussen en trams naar jouw bestemming op één vertrekbord.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={inter.variable}>
      <body className="min-h-dvh overscroll-none bg-achtergrond font-sans text-tekst antialiased">
        {children}
        <ServiceWorker />
        <SessionGuard />
      </body>
    </html>
  );
}
