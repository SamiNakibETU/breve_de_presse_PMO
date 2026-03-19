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
    <header className="sticky top-0 z-30 border-b border-border-light bg-background">
      <div className="mx-auto flex max-w-[var(--max-width-page)] items-baseline justify-between px-[var(--spacing-page)] py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-serif text-xl font-bold tracking-tight text-foreground">
            L&rsquo;Orient-Le Jour
          </span>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground sm:inline">
            Revue de presse
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-3 py-1.5 text-[13px] font-medium tracking-wide transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                {active && (
                  <span className="mt-1 block h-px bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
