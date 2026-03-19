"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Sujets" },
  { href: "/articles", label: "Articles" },
  { href: "/review", label: "Revue de presse" },
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
    <header className="bg-white">
      <div className="mx-auto max-w-5xl px-5">
        <div className="flex items-center justify-between border-b border-[#dddcda] py-4">
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
          <span className="text-[11px] font-medium text-[#888]">
            Revue de presse régionale
          </span>
        </div>

        <nav className="flex gap-6 py-2.5">
          {NAV_ITEMS.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

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
                  "text-[13px] transition-colors",
                  active
                    ? "font-semibold text-[#1a1a1a]"
                    : "text-[#888] hover:text-[#1a1a1a]"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="h-px bg-[#dddcda]" />
    </header>
  );
}
