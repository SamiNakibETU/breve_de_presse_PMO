"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";
import { cn } from "@/lib/utils";
import { todayBeirutIsoDate } from "@/lib/beirut-date";

const PRIMARY_NAV_REST = [
  { href: "/dashboard", label: "Panorama" },
  { href: "/articles", label: "Articles" },
] as const;

function prefetchNavData(queryClient: ReturnType<typeof useQueryClient>) {
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
  const todayEditionHref = `/edition/${todayBeirutIsoDate()}`;
  const composeHref = `${todayEditionHref}/compose`;

  useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => api.stats(),
    staleTime: 60_000,
  });

  const statusQ = useQuery({
    queryKey: ["status"] as const,
    queryFn: () => api.status(),
    staleTime: 30_000,
    refetchInterval: (q) =>
      q.state.data?.pipeline_running === true ? 4_000 : false,
  });
  const serverPipelineBusy = Boolean(statusQ.data?.pipeline_running);

  return (
    <header className="border-b border-border bg-background shadow-sm">
      <div className="mx-auto max-w-[80rem] px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link
              href={todayEditionHref}
              prefetch
              onMouseEnter={() => prefetchNavData(queryClient)}
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
                disabled={running !== null || serverPipelineBusy}
                title={
                  serverPipelineBusy
                    ? "Un pipeline complet est déjà en cours sur le serveur."
                    : undefined
                }
                onClick={() =>
                  pipeline.startRun("pipeline", "Traitement complet")
                }
              >
                {running?.key === "pipeline"
                  ? "Traitement…"
                  : serverPipelineBusy
                    ? "Pipeline serveur…"
                    : "Actualiser (traitement complet)"}
              </button>
            )}
          </div>
        </div>

        <nav
          className="flex flex-wrap items-center gap-2 border-t border-border py-3 sm:gap-3"
          aria-label="Navigation principale"
        >
          <Link
            href={todayEditionHref}
            prefetch
            onMouseEnter={() => prefetchNavData(queryClient)}
            className={cn(
              "olj-nav-item",
              (pathname === "/" ||
                (pathname.startsWith("/edition") && !pathname.includes("/compose"))) &&
                "olj-nav-item--active",
            )}
          >
            Édition du jour
          </Link>
          {PRIMARY_NAV_REST.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                prefetch
                onMouseEnter={() => {
                  if (href === "/dashboard") {
                    prefetchNavData(queryClient);
                  }
                }}
                className={cn(
                  "olj-nav-item",
                  active && "olj-nav-item--active",
                )}
              >
                {label}
              </Link>
            );
          })}
          <Link
            href={composeHref}
            prefetch
            className={cn(
              "olj-nav-item",
              pathname.includes("/compose") && "olj-nav-item--active",
            )}
          >
            Rédaction
          </Link>
          <Link
            href="/regie"
            prefetch
            className={cn(
              "olj-nav-item olj-nav-item--subtle sm:ml-auto",
              pathname.startsWith("/regie") && "olj-nav-item--active",
            )}
          >
            Régie
          </Link>
        </nav>
      </div>
    </header>
  );
}
