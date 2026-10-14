import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance OS",
  description: "Meu painel financeiro pessoal",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finance OS", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f6f8" }, { media: "(prefers-color-scheme: dark)", color: "#0b0d10" }],
  width: "device-width", initialScale: 1, viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
