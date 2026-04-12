/**
 * Primitives éditoriales partagées.
 * Vocabulaire visuel cohérent sur toutes les pages (Sujets, Panorama, Articles, Lecteur).
 *
 * Ryo Lu : "La beauté vient de la structure, pas de la couleur."
 * Ces composants codifient la structure typographique du produit.
 */

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ── Label de section ──────────────────────────────────────────────────────── */

/**
 * Label de section : uppercase discret, spacing généreux.
 * Usage : THÈSE, ANALYSE, RÉSUMÉ, CITATIONS — partout où une section commence.
 */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/* ── Filet éditorial ───────────────────────────────────────────────────────── */

/**
 * Filet horizontal — deux variantes :
 * - "strong" : 2px foreground (sous titres majeurs de sujet)
 * - "light"  : 1px border (séparateurs de contenu)
 */
export function EditorialRule({
  variant = "light",
  className,
}: {
  variant?: "strong" | "light";
  className?: string;
}) {
  return (
    <hr
      className={cn(
        "border-0",
        variant === "strong"
          ? "border-t-2 border-foreground"
          : "border-t border-border",
        className,
      )}
    />
  );
}

/* ── Ligne de méta ─────────────────────────────────────────────────────────── */

/**
 * Ligne de méta inline — séparateurs · entre items.
 * Passe null/undefined silencieusement.
 */
export function MetaLine({
  items,
  className,
}: {
  items: (string | null | undefined)[];
  className?: string;
}) {
  const parts = items.filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return (
    <p
      className={cn(
        "text-[12px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && (
            <span className="mx-1.5 text-border" aria-hidden>
              ·
            </span>
          )}
          {p}
        </span>
      ))}
    </p>
  );
}

/* ── Bloc thèse ────────────────────────────────────────────────────────────── */

/**
 * Thèse : serif italique — invariant cross-composants.
 * La thèse est le cœur éditorial. Ne jamais la tronquer dans les vues pleine largeur.
 */
export function ThesisBlock({
  thesis,
  attribution,
  lineClamp,
  size = "body",
  className,
}: {
  thesis: string;
  attribution?: string;
  lineClamp?: 2 | 3 | 4;
  size?: "subhead" | "body";
  className?: string;
}) {
  const sizeClass = size === "subhead" ? "text-[16px]" : "text-[14px]";
  const clampClass =
    lineClamp === 2
      ? "line-clamp-2"
      : lineClamp === 3
        ? "line-clamp-3"
        : lineClamp === 4
          ? "line-clamp-4"
          : "";

  return (
    <div className={cn("space-y-1", className)}>
      <p
        className={cn(
          "font-[family-name:var(--font-serif)] italic leading-relaxed text-foreground-body",
          sizeClass,
          clampClass,
        )}
      >
        {thesis}
      </p>
      {attribution ? (
        <p className="text-[11px] text-muted-foreground">— {attribution}</p>
      ) : null}
    </div>
  );
}

/* ── Puces d'analyse ────────────────────────────────────────────────────────── */

/**
 * Puces d'analyse : numéros accent + filet gauche accent.
 * Limite configurable (défaut 3).
 */
export function AnalysisBullets({
  bullets,
  maxVisible = 3,
  className,
}: {
  bullets: string[];
  maxVisible?: number;
  className?: string;
}) {
  if (!bullets.length) return null;
  const shown = bullets.slice(0, maxVisible);
  const rest = bullets.length - shown.length;

  return (
    <div
      className={cn(
        "border-l-2 border-accent bg-[color-mix(in_srgb,var(--color-muted)_28%,transparent)] py-2.5 pl-3.5 pr-3",
        "rounded-r-md",
        className,
      )}
    >
      <ul className="space-y-1.5">
        {shown.map((b, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug text-foreground-body">
            <span
              className="mt-px shrink-0 text-[11px] font-bold tabular-nums text-accent"
              aria-hidden
            >
              {i + 1}.
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          + {rest} idée{rest > 1 ? "s" : ""}
        </p>
      ) : null}
    </div>
  );
}

/* ── Badge type article ────────────────────────────────────────────────────── */

/**
 * Badge type : ÉDITORIAL / OPINION / TRIBUNE en accent, autres en muted.
 * Petit, uppercase, sans contour — style "label de magazine".
 */
export function ArticleTypeBadge({
  type,
  label,
  className,
}: {
  type: string | null | undefined;
  label: string;
  className?: string;
}) {
  const isEditorial = ["opinion", "editorial", "tribune"].includes(
    (type ?? "").toLowerCase(),
  );
  return (
    <span
      className={cn(
        "text-[10px] font-bold uppercase tracking-[0.12em]",
        isEditorial ? "text-accent" : "text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
