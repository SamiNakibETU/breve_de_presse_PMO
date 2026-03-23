"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { href: "/", label: "Sommaire" },
  { href: "/articles", label: "Articles" },
] as const;

const REGIE_NAV = [
  { href: "/regie", label: "Vue d’ensemble" },
  { href: "/dashboard", label: "Sujets automatiques" },
  { href: "/regie/sources", label: "Sources" },
  { href: "/regie/pipeline", label: "Collecte et traduction" },
  { href: "/regie/logs", label: "Journaux" },
] as const;

function prefetchDashboardData(queryClient: ReturnType<typeof useQueryClient>) {
  void Promise.all([
    queryClient.prefetchQuery({
      queryKey: ["stats"] as const,
      queryFn: () => api.stats(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["status"] as const,
      queryFn: () => api.status(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["clusters"] as const,
      queryFn: () => api.clusters(),
    }),
  ]);
}

export function Masthead() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const statsQ = useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => api.stats(),
    staleTime: 60_000,
  });

  const collectHint =
    statsQ.data != null
      ? `${statsQ.data.total_collected_24h.toLocaleString("fr-FR")} article(s) collecté(s) sur les dernières 24 h`
      : null;

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto max-w-[80rem] px-5 sm:px-6">
        <div className="flex items-center justify-between py-5">
          <Link
            href="/"
            prefetch
            onMouseEnter={() => prefetchDashboardData(queryClient)}
          >
            <Image
              src="/logo_olj.svg"
              alt="L'Orient-Le Jour"
              width={200}
              height={30}
              priority
              className="h-[28px] w-auto"
            />
          </Link>
          <span className="max-w-[11rem] text-right text-[11px] font-medium leading-snug tracking-wide text-muted-foreground sm:max-w-none">
            Outil revue de presse
          </span>
        </div>

        <nav
          className="flex flex-wrap gap-x-8 gap-y-1 border-t border-border py-3.5"
          aria-label="Navigation principale"
        >
          {PRIMARY_NAV.map(({ href, label }) => {
            const active =
              href === "/"
                ? pathname === "/" || pathname.startsWith("/edition")
                : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                prefetch
                onMouseEnter={() => {
                  if (href === "/") prefetchDashboardData(queryClient);
                }}
                className={cn(
                  "relative pb-1 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
                  active
                    ? "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <nav
          className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border py-2.5"
          aria-label="Administration"
        >
          <span className="w-full text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:w-auto sm:self-center sm:py-0">
            Administration
          </span>
          {REGIE_NAV.map(({ href, label }) => {
            const active =
              href === "/regie"
                ? pathname === "/regie"
                : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={cn(
                  "text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "font-semibold text-accent underline decoration-accent underline-offset-4"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {collectHint ? (
          <p className="border-t border-border py-2 text-[10px] tabular-nums text-muted-foreground">
            {collectHint}
          </p>
        ) : null}
      </div>
    </header>
  );
}
