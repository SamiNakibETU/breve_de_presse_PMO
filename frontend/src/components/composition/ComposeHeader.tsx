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
    <header className="space-y-5 border-b border-border/60 pb-6 sm:pb-8">
      {/* Nav + titre */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <Link href={`/edition/${date}`} className="olj-link-action">
              ← Sommaire
            </Link>
          </nav>
          <p className="olj-rubric">Rédaction</p>
          <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold tracking-tight text-foreground sm:text-[22px]">
            {titleFr}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <EditionCalendarPopover
              currentIso={date}
              compact
              onDateSelect={(iso) => router.push(`/edition/${iso}/compose`)}
            />
            <span className="leading-snug">{formatIsoCalendarDayLongFr(date)}</span>
          </div>
        </div>

        {/* KPIs — 2 cols mobile, 4 cols sm+ */}
        <dl
          className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-[11px] text-muted-foreground sm:grid-cols-4 sm:text-right"
          aria-label="Indicateurs de la sélection"
        >
          {kpis.map((kpi) => (
            <div key={kpi.label} className="sm:text-right">
              <dt className="sr-only">{kpi.label}</dt>
              <dd className="tabular-nums text-[18px] font-semibold leading-none text-foreground sm:text-[20px]">
                {kpi.value}
              </dd>
              <dd className="mt-0.5 text-[10px] leading-tight">{kpi.label}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Message contextuel */}
      {!hasSelection ? (
        <p className="max-w-2xl border-l-2 border-accent/45 pl-4 text-[12px] leading-relaxed text-foreground-body">
          Au{" "}
          <Link href={`/edition/${date}`} className="olj-link-action">
            sommaire
          </Link>
          , cochez au moins <strong className="font-medium text-foreground">deux articles</strong> par
          grand sujet — ou utilisez les suggestions ci-dessous avec le bouton « + ».
        </p>
      ) : (
        <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Réorganisez les articles, définissez les consignes puis lancez la génération. Les blocs
          générés apparaissent dans chaque sujet ci-dessous.
        </p>
      )}
    </header>
  );
}
