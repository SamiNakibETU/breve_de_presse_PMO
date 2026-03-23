"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/regie", label: "Vue d’ensemble" },
  { href: "/regie/sources", label: "Sources" },
  { href: "/regie/pipeline", label: "Collecte et traduction" },
  { href: "/regie/dedup", label: "Dédoublonnage" },
  { href: "/regie/clustering", label: "Regroupements" },
  { href: "/regie/curator", label: "Curateur" },
  { href: "/regie/logs", label: "Journaux" },
];

export function RegieNav() {
  const pathname = usePathname();
  return (
    <nav
      className="flex flex-wrap gap-x-3 gap-y-1 border-b border-border pb-3 text-[12px] text-muted-foreground"
      aria-label="Régie"
    >
      {LINKS.map(({ href, label }) => {
        const active =
          href === "/regie"
            ? pathname === "/regie"
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? "font-medium text-foreground underline decoration-accent underline-offset-4"
                : "hover:text-foreground hover:underline hover:decoration-border hover:underline-offset-4"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
