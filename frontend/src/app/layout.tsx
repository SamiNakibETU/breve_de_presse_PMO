import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Masthead } from "@/components/layout/sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "L'Orient-Le Jour — Revue de Presse Régionale",
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
        <main className="mx-auto max-w-[var(--max-width-page)] px-[var(--spacing-page)] py-8">
          {children}
        </main>
        <footer className="border-t border-border-light py-6 text-center text-[11px] tracking-wide text-muted-foreground">
          L&rsquo;Orient-Le Jour &mdash; Revue de presse régionale &mdash; {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
