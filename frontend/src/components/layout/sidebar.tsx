"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { href: "/", label: "Sommaire" },
  { href: "/articles", label: "Articles" },
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
  const pipeline = usePipelineRunnerOptional();
  const running = pipeline?.running ?? null;

  useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => api.stats(),
    staleTime: 60_000,
  });

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto max-w-[80rem] px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
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
            <span className="hidden text-[11px] font-medium leading-snug tracking-wide text-muted-foreground sm:inline sm:max-w-[14rem]">
              Outil revue de presse
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground sm:hidden">
              Revue de presse
            </span>
            {pipeline && (
              <button
                type="button"
                className="olj-btn-secondary shrink-0"
                disabled={running !== null}
                onClick={() => pipeline.startRun("collect", "Collecte")}
              >
                {running?.key === "collect" ? "Collecte…" : "Lancer la collecte"}
              </button>
            )}
          </div>
        </div>

        <nav
          className="flex flex-wrap gap-x-8 gap-y-1 border-t border-border py-3"
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
                    ? "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
          <Link
            href="/regie"
            prefetch
            className={cn(
              "relative pb-1 text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:ml-auto",
              pathname.startsWith("/regie") ||
                pathname.startsWith("/dashboard")
                ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Régie
          </Link>
        </nav>
      </div>
    </header>
  );
}
