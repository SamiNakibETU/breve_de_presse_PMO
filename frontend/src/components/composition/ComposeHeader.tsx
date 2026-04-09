"use client";

import Link from "next/link";
import { UI_SURFACE_INSET, UI_SURFACE_INSET_PAD } from "@/lib/ui-surface-classes";

interface ComposeKpi {
  label: string;
  value: number;
}

interface ComposeHeaderProps {
  date: string;
  titleFr: string;
  kpis: ComposeKpi[];
  hasSelection: boolean;
}

export function ComposeHeader({ date, titleFr, kpis, hasSelection }: ComposeHeaderProps) {
  return (
    <header className="space-y-4">
      <nav className="text-[13px]">
        <Link href={`/edition/${date}`} className="olj-link-action">
          ← Retour au sommaire de l&apos;édition
        </Link>
      </nav>
      <p className="olj-rubric">Rédaction</p>
      <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold">
        {titleFr}
      </h1>
      <div
        className={`flex flex-wrap gap-3 ${UI_SURFACE_INSET} ${UI_SURFACE_INSET_PAD}`}
        aria-label="Indicateurs de la sélection"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="olj-kpi-tile min-w-[6.5rem] flex-1 basis-[6.5rem] sm:min-w-[7.5rem] sm:basis-[7.5rem]"
          >
            <p className="text-[22px] font-semibold tabular-nums text-foreground">
              {kpi.value}
            </p>
            <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
          </div>
        ))}
      </div>
      {!hasSelection ? (
        <div className="max-w-2xl space-y-3 rounded-lg border border-border/60 bg-surface-warm/25 px-4 py-4 text-[12px] leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            Aucune sélection pour l&apos;instant — par où commencer
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-foreground-body">
            <li>
              <Link href={`/edition/${date}`} className="olj-link-action">
                Sommaire de l&apos;édition
              </Link>{" "}
              : cocher au moins{" "}
              <strong className="font-medium text-foreground">deux articles</strong> dans
              un grand sujet (condition minimale pour générer un texte fiable).
            </li>
            <li>
              <Link href="/panorama" className="olj-link-action">
                Panorama
              </Link>{" "}
              : vue globale des volumes et de l&apos;édition du jour si besoin de contexte
              hors cette date.
            </li>
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Ensuite : ordre des sujets (glisser-déposer), consignes optionnelles, puis
            « Rédiger ce bloc » ou génération globale — copier-coller et export plus bas.
          </p>
        </div>
      ) : (
        <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Sélection active : ordre des articles, consignes et génération. L&apos;aide
          ci-dessus réapparaît si toutes les coches sont retirées depuis le sommaire.
        </p>
      )}
    </header>
  );
}
