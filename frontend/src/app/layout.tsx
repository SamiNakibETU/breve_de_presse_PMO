import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Masthead } from "@/components/layout/sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "L'Orient-Le Jour — Revue de presse régionale",
  description:
    "Revue de presse régionale automatisée — L'Orient-Le Jour",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${inter.className} antialiased`}>
        <Masthead />
        <main className="mx-auto max-w-5xl px-5 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
