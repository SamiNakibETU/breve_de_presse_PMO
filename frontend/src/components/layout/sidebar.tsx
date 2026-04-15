"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { todayBeirutIsoDate } from "@/lib/beirut-date";
import { editionCalendarDateFromPath } from "@/lib/edition-nav-date";

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
  const today = todayBeirutIsoDate();
  const todayEditionHref = `/edition/${today}`;
  const navEditionDate = editionCalendarDateFromPath(pathname) ?? today;
  const composeNavHref = `/edition/${navEditionDate}/compose`;
  const onComposeRoute = pathname.includes("/compose");

  useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => api.stats(),
    staleTime: 60_000,
  });

  return (
    <header className="border-b border-border bg-background shadow-sm">
      <div className="mx-auto max-w-[80rem] px-5 sm:px-6">
        <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-3 sm:py-5">
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1 sm:gap-4">
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
                className="h-[28px] w-auto sm:h-[34px]"
              />
            </Link>
            <span className="hidden text-[11px] font-medium leading-snug tracking-wide text-muted-foreground sm:inline sm:max-w-[14rem]">
              Outil revue de presse
            </span>
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
              (pathname === "/" ||
                (pathname.startsWith("/edition") && !onComposeRoute)) &&
                "olj-nav-item--active",
            )}
          >
            Édition
          </Link>
          <Link
            href={composeNavHref}
            prefetch
            onMouseEnter={() => prefetchNavData(queryClient)}
            className={cn("olj-nav-item shrink-0", onComposeRoute && "olj-nav-item--active")}
          >
            Composition
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

      </div>
    </header>
  );
}
