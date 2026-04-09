import type { ReactElement } from "react";
import { PrototypeSpecimenEditionRail } from "@/components/design-frise/prototype-specimen-edition-rail";
import { PrototypeSpecimenFenetreGlobale } from "@/components/design-frise/prototype-specimen-fenetre-globale";
import { PrototypeSpecimenPlageJour } from "@/components/design-frise/prototype-specimen-plage-jour";
import { UI_FRISE_META_TEXT } from "@/lib/ui-surface-classes";

/**
 * Page lab : d’abord **une** surface minimaliste « édition du jour » ; le reste est du hors-périmètre, replié.
 */
export function FriseDesignLab(): ReactElement {
  return (
    <div className="pb-24">
      <header className="mx-auto mb-14 max-w-lg text-center">
        <h1 className="font-[family-name:var(--font-serif)] text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Laboratoire — frise
        </h1>
        <p className={`${UI_FRISE_META_TEXT} mt-3 text-pretty`}>
          Glisser ou utiliser le calendrier. Le titre et la fenêtre de collecte s&apos;animent au changement de jour.
        </p>
      </header>

      <PrototypeSpecimenEditionRail />

      <details className="mx-auto mt-20 max-w-2xl rounded-xl border border-border/30 bg-[color-mix(in_srgb,var(--color-muted)_8%,transparent)] px-4 py-3 sm:px-5">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Autres écrans (Articles · Régie) — pas le flux « édition du jour »
        </summary>
        <div className="mt-8 space-y-16 border-t border-border/25 pt-10">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Articles</h2>
            <p className={UI_FRISE_META_TEXT}>Jour puis heure sur la grille démo — filtres de liste, pas la carte Édition.</p>
            <PrototypeSpecimenPlageJour />
          </section>
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Régie / synthèse</h2>
            <p className={UI_FRISE_META_TEXT}>Vue condensée sur toute la période démo.</p>
            <PrototypeSpecimenFenetreGlobale />
          </section>
        </div>
      </details>
    </div>
  );
}
