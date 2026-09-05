import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "ARGOS · Consola de operaciones",
  description: "Consola de visión por computadora de Vantor Group. Demo con datos simulados.",
};

export const viewport: Viewport = {
  themeColor: "#06080F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AppShell mono={GeistMono.style.fontFamily} sans={GeistSans.style.fontFamily}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
