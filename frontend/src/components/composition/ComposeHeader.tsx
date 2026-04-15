"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { formatIsoCalendarDayLongFr } from "@/lib/dates-display-fr";

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
  const router = useRouter();

  return (
    <header className="space-y-6 border-b border-border/60 pb-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <Link href={`/edition/${date}`} className="olj-link-action">
              ← Sommaire
            </Link>
            <span className="hidden text-[11px] sm:inline">
              L’entrée <strong className="font-medium text-foreground-body">Composition</strong> est aussi dans
              le bandeau principal.
            </span>
          </nav>
          <p className="olj-rubric">Rédaction</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold tracking-tight text-foreground">
              {titleFr}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <EditionCalendarPopover
                currentIso={date}
                compact
                onDateSelect={(iso) => router.push(`/edition/${iso}/compose`)}
              />
              <span className="max-w-[min(100%,20rem)] leading-snug">
                {formatIsoCalendarDayLongFr(date)}
              </span>
            </div>
          </div>
        </div>
        <dl
          className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-muted-foreground sm:grid-cols-4 lg:text-right"
          aria-label="Indicateurs de la sélection"
        >
          {kpis.map((kpi) => (
            <div key={kpi.label} className="lg:text-right">
              <dt className="sr-only">{kpi.label}</dt>
              <dd className="tabular-nums text-[20px] font-semibold leading-none text-foreground">
                {kpi.value}
              </dd>
              <dd className="mt-0.5 leading-tight">{kpi.label}</dd>
            </div>
          ))}
        </dl>
      </div>
      {!hasSelection ? (
        <p className="max-w-2xl border-l-2 border-accent/45 pl-4 text-[12px] leading-relaxed text-foreground-body">
          Au{" "}
          <Link href={`/edition/${date}`} className="olj-link-action">
            sommaire
          </Link>
          , cochez au moins <strong className="font-medium text-foreground">deux articles</strong> par
          grand sujet. Le{" "}
          <Link href="/panorama" className="olj-link-action">
            panorama
          </Link>{" "}
          donne le contexte volumes si besoin.
        </p>
      ) : (
        <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Ordre des articles, consignes puis génération — les blocs se mettent à jour ci-dessous.
        </p>
      )}
    </header>
  );
}
