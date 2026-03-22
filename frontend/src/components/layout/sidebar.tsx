"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Sommaire" },
  { href: "/dashboard", label: "Sujets du jour" },
  { href: "/articles", label: "Articles" },
  { href: "/review", label: "Revue de presse" },
  { href: "/regie", label: "Régie" },
];

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

  return (
    <header className="border-b border-border-light bg-background">
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
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
          <span className="max-w-[11rem] text-right text-[11px] leading-snug tracking-wide text-muted-foreground sm:max-w-none">
            Revue de presse régionale
          </span>
        </div>

        <nav
          className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border-light py-3"
          aria-label="Navigation principale"
        >
          {NAV_ITEMS.map(({ href, label }) => {
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
                  if (href === "/review") {
                    void queryClient.prefetchQuery({
                      queryKey: ["reviews"] as const,
                      queryFn: () => api.reviews(),
                    });
                  }
                }}
                className={cn(
                  "border-b border-transparent pb-0.5 text-[13px] transition-colors",
                  active
                    ? "border-foreground font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
