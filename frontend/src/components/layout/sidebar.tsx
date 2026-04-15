"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";
import { cn } from "@/lib/utils";
import { todayBeirutIsoDate } from "@/lib/beirut-date";
import { confirmHeavyPipelineRun } from "@/lib/pipeline-confirm";

const PRIMARY_NAV = [
  { href: "/panorama", label: "Panorama" },
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 py-3.5 sm:gap-x-4 sm:gap-y-3 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <Link
              href={todayEditionHref}
              prefetch
              onMouseEnter={() => prefetchNavData(queryClient)}
              className="shrink-0"
            >
              <Image
                src="/logo_olj.svg"
                alt="L'Orient-Le Jour"
                width={220}
                height={34}
                priority
                className="h-[32px] w-auto sm:h-[34px]"
              />
            </Link>
            <span className="hidden text-[11px] font-medium leading-snug tracking-wide text-muted-foreground sm:inline sm:max-w-[14rem]">
              Outil revue de presse
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pipeline && (
              <>
                {/* Desktop : libellé complet */}
                <button
                  type="button"
                  className="olj-btn-secondary hidden shrink-0 sm:inline-flex"
                  disabled={running !== null || serverPipelineBusy}
                  title={
                    serverPipelineBusy
                      ? "Un pipeline complet est déjà en cours sur le serveur."
                      : "Lancer collecte, traduction et traitements complets (plusieurs minutes)."
                  }
                  onClick={() => {
                    if (!confirmHeavyPipelineRun("pipeline")) return;
                    pipeline.startRun("pipeline", "Traitement complet");
                  }}
                >
                  {running?.key === "pipeline"
                    ? "Traitement…"
                    : serverPipelineBusy
                      ? "Pipeline serveur…"
                      : "Actualiser (traitement complet)"}
                </button>
              </>
            )}
          </div>
        </div>

        <nav
          className="olj-scrollbar-none -mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-border px-1 py-3 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0"
          aria-label="Navigation principale"
        >
          {/* Édition — point d'entrée unique pour tout le flux éditorial */}
          <Link
            href={todayEditionHref}
            prefetch
            onMouseEnter={() => prefetchNavData(queryClient)}
            className={cn(
              "olj-nav-item shrink-0",
              (pathname === "/" || pathname.startsWith("/edition")) &&
                "olj-nav-item--active",
            )}
          >
            Édition
          </Link>
          {PRIMARY_NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                onMouseEnter={() => {
                  if (href === "/panorama") prefetchNavData(queryClient);
                }}
                className={cn(
                  "olj-nav-item shrink-0",
                  active && "olj-nav-item--active",
                )}
              >
                {label}
              </Link>
            );
          })}

          {/* Régie — icône engrenage, poussée à droite */}
          <Link
            href="/regie"
            prefetch
            title="Régie"
            aria-label="Régie"
            className={cn(
              "ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
              pathname.startsWith("/regie") && "bg-muted text-foreground",
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
        </nav>

        {/* La nav Sommaire/Composition est gérée par la page elle-même */}
      </div>
    </header>
  );
}
