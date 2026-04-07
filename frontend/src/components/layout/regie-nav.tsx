"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const PRODUCTION: { href: string; label: string }[] = [
  { href: "/regie/pipeline", label: "Collecte et traduction" },
  { href: "/regie/dedup", label: "Dédoublonnage" },
  { href: "/regie/clustering", label: "Regroupements" },
  { href: "/panorama", label: "Panorama" },
  { href: "/regie/curator", label: "Curateur" },
];

const DATA_AND_OPS: { href: string; label: string }[] = [
  { href: "/regie", label: "Vue d’ensemble" },
  { href: "/regie/sources", label: "Sources" },
  { href: "/regie/logs", label: "Journaux" },
  { href: "/regie/analytics", label: "Analytique interne" },
];

function linkActive(pathname: string, href: string): boolean {
  if (href === "/regie") {
    return pathname === "/regie";
  }
  if (href === "/panorama") {
    return pathname.startsWith("/panorama");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  title,
  links,
  pathname,
  className,
}: {
  title: string;
  links: { href: string; label: string }[];
  pathname: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2",
        className,
      )}
    >
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </span>
      <div className="flex flex-wrap gap-2">
        {links.map(({ href, label }) => {
          const active = linkActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "olj-nav-item olj-nav-item--subtle",
                active && "olj-nav-item--active",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function RegieNav() {
  const pathname = usePathname();
  return (
    <nav
      className="space-y-4 border-b border-border pb-4"
      aria-label="Régie"
    >
      <NavRow title="Production" links={PRODUCTION} pathname={pathname} />
      <NavRow
        title="Données & suivi"
        links={DATA_AND_OPS}
        pathname={pathname}
        className="border-t border-border/60 pt-4"
      />
    </nav>
  );
}
