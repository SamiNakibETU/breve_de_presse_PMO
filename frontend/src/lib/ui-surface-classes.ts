/**
 * Surfaces UI partagées (édition, Panorama, Articles, stats).
 * Garder bordures, fonds et ombres alignés entre ces écrans.
 */

/** En-tête de page type « héros » (ex. Panorama) */
export const UI_SURFACE_HERO =
  "rounded-2xl border border-border/35 bg-[linear-gradient(165deg,color-mix(in_srgb,var(--color-muted)_22%,transparent)_0%,transparent_55%)] shadow-[0_1px_0_rgba(0,0,0,0.04)]";

/** Carte encastrée : rail édition unifié, bloc frise + corpus Panorama, rail Articles */
export const UI_SURFACE_INSET =
  "rounded-xl border border-border/35 bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] shadow-[0_1px_0_rgba(0,0,0,0.03)]";

/** Padding standard des surfaces encastrées (contenu dense) */
export const UI_SURFACE_INSET_PAD = "p-3 sm:p-4";

/** Rail édition (titre + contrôles + frise) : padding horizontal un peu plus large sur sm */
export const UI_SURFACE_RAIL_PAD = "px-3 py-3 sm:px-4 sm:py-3.5";

/** Bloc frise + méta : même carte que le bandeau Édition (largeur max + padding rail) */
export const UI_SURFACE_FRise_INSET =
  `w-full max-w-4xl ${UI_SURFACE_INSET} ${UI_SURFACE_RAIL_PAD}`;

/** Panneaux liste (Pays, Langues) */
export const UI_SURFACE_PANEL =
  "rounded-xl border border-border/35 bg-[color-mix(in_srgb,var(--color-muted)_14%,transparent)] p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)]";

/** Filet au-dessus de la frise (dans une carte qui a déjà un bloc méta au-dessus) */
export const UI_SURFACE_FRISE_SEPARATOR = "border-t border-border/25 pt-4";

/** Séparateur + marge avant la frise (sous la rangée titre + contrôles) */
export const UI_SURFACE_FRISE_DIVIDER = `mt-4 ${UI_SURFACE_FRISE_SEPARATOR}`;

/** Placeholder de chargement aligné sur les cartes encastrées */
export const UI_SURFACE_SKELETON_INSET =
  "rounded-xl border border-border/35 bg-[color-mix(in_srgb,var(--color-muted)_18%,transparent)]";
