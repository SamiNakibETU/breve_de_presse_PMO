import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Masthead } from "@/components/layout/sidebar";
import { PipelineGlobalBar } from "@/components/layout/pipeline-global-bar";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "L'Orient-Le Jour · Revue de presse régionale",
  description: "Revue de presse régionale · L'Orient-Le Jour",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="light">
      <body
        className={`${inter.variable} ${inter.className} bg-background text-foreground antialiased`}
      >
        <Providers>
          <Masthead />
          <PipelineGlobalBar />
          <main
            data-reader-layout
            className="mx-auto min-h-[min(100vh,64rem)] max-w-[80rem] px-5 py-10 pb-16 sm:px-6 sm:pb-20"
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
