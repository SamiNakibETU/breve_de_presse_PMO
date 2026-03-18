import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OLJ — Revue de Presse Régionale",
  description:
    "Système automatisé de revue de presse régionale pour L'Orient-Le Jour",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${inter.className} antialiased`}>
        <Sidebar />
        <main className="ml-60 min-h-screen p-6">{children}</main>
      </body>
    </html>
  );
}
