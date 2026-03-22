import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Masthead } from "@/components/layout/sidebar";
import { PipelineGlobalBar } from "@/components/layout/pipeline-global-bar";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

/** MEMW §2.5.6 : titres / thèses en Poynter (fichiers locaux dans `public/fonts/`, voir globals.css). */
export const metadata: Metadata = {
  title: "L'Orient-Le Jour — Revue de presse régionale",
  description:
    "Revue de presse régionale — L'Orient-Le Jour",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="light">
      <body
        className={`${inter.className} bg-background text-foreground antialiased`}
      >
        <Providers>
          <Masthead />
          <PipelineGlobalBar />
          <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
