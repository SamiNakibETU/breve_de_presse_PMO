"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Tableau de bord" },
  { href: "/articles", label: "Articles" },
  { href: "/review", label: "Revue de presse" },
];

export function Masthead() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-5">
        <div className="flex items-baseline justify-between py-4">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="font-[family-name:var(--font-narrow)] text-2xl font-semibold tracking-tight text-foreground">
              L&rsquo;Orient-Le Jour
            </span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-accent sm:inline">
              Revue de presse
            </span>
          </Link>
        </div>

        <nav className="-mb-px flex gap-0">
          {NAV_ITEMS.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "border-b-2 px-4 pb-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors",
                  active
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
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
