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
    <header className="sticky top-0 z-30 border-b border-border-light/80 bg-background/98">
      <div className="mx-auto flex max-w-[var(--max-width-page)] items-end justify-between gap-8 px-[var(--spacing-page)] pt-4 pb-2.5">
        <Link href="/" className="flex flex-col gap-0.5">
          <span className="font-serif text-[1.35rem] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            L&rsquo;Orient-Le Jour
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            Revue de presse
          </span>
        </Link>

        <nav className="flex items-baseline gap-0">
          {NAV_ITEMS.map(({ href, label }, i) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-block font-mono text-[11px] tracking-[0.12em] transition-colors",
                  i > 0 && "border-l border-border-light/70 pl-4 ml-4",
                  active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground/80"
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
