"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArticlesPeriodRail } from "@/components/articles/articles-period-rail";
import { api } from "@/lib/api";
import { todayBeirutIsoDate } from "@/lib/beirut-date";
import { formatIsoCalendarDayLongFr } from "@/lib/dates-display-fr";
import type { ClusterListResponse, Stats, TopicCluster } from "@/lib/types";
import { ClusterList } from "@/components/clusters/cluster-list";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { StatsDistributionPanels } from "@/components/dashboard/stats-distribution-panels";
import { COUNTRY_LABELS_FR } from "@/lib/country-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import {
  UI_SURFACE_FRise_INSET,
  UI_SURFACE_FRISE_SEPARATOR,
  UI_SURFACE_HERO,
  UI_SURFACE_SKELETON_INSET,
} from "@/lib/ui-surface-classes";

function filterClusters(
  list: TopicCluster[],
  countryCodes: string[],
  emergingOnly: boolean,
): TopicCluster[] {
  let out = list;
  if (emergingOnly) {
    out = out.filter((c) => c.is_emerging === true);
  }
  if (countryCodes.length > 0) {
    out = out.filter((c) =>
      countryCodes.some((code) => c.countries.includes(code)),
    );
  }
  return out;
}

/**
 * Vue Panorama : inventaire, répartitions, clusters — sans bloc pipeline Régie.
 */
const CHIP_BASE =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] font-medium leading-tight transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]";
const CHIP_OFF =
  "border-border/55 bg-[color-mix(in_srgb,var(--color-muted)_18%,transparent)] text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground";
const CHIP_ON =
  "border-[color-mix(in_srgb,var(--color-accent)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_11%,transparent)] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.05)]";

export function PanoramaPageContent() {
  const searchParams = useSearchParams();
  const [countryFilter, setCountryFilter] = useState<string[]>([]);
  const [emergingOnly, setEmergingOnly] = useState(false);
  const urlPanoramaDate = searchParams.get("date")?.trim() || null;
  const editionDate = urlPanoramaDate ?? todayBeirutIsoDate();

  const editionTodayQ = useQuery({
    queryKey: ["edition", editionDate, "panorama"] as const,
    queryFn: () => api.editionByDate(editionDate),
    retry: false,
    staleTime: 60_000,
  });

  const [statsQ, clustersQ] = useQueries({
    queries: [
      {
        queryKey: ["stats"] as const,
        queryFn: (): Promise<Stats> => api.stats(),
      },
      {
        queryKey: ["clusters"] as const,
        queryFn: (): Promise<ClusterListResponse> => api.clusters(),
      },
    ],
  });

  const clustersOnlyLoading = clustersQ.isPending;
  const error = statsQ.error?.message ?? clustersQ.error?.message ?? null;

  const stats = statsQ.data ?? null;
  const clusters = clustersQ.data ?? null;
  const clusterRows = useMemo(() => clusters?.clusters ?? [], [clusters]);

  const countryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of clusterRows) {
      for (const co of c.countries) s.add(co);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "fr"));
  }, [clusterRows]);

  const filteredClusters = useMemo(
    () => filterClusters(clusterRows, countryFilter, emergingOnly),
    [clusterRows, countryFilter, emergingOnly],
  );

  const dateStr = formatIsoCalendarDayLongFr(editionDate);
  const subjectCount = filteredClusters.length;

  const editionToday = editionTodayQ.data;
  const editionWindowOk =
    editionToday?.window_start &&
    editionToday?.window_end &&
    editionTodayQ.isSuccess;

  return (
    <div className="space-y-10">
      <header className="space-y-6">
        <div className={`${UI_SURFACE_HERO} p-5 sm:p-6`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 text-center sm:text-left">
              <p className="olj-rubric">Vue régionale</p>
              <h1 className="mt-1 font-[family-name:var(--font-serif)] text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
                Panorama
              </h1>
              <p className="mt-2 text-[13px] capitalize text-muted-foreground">
                {dateStr} · {subjectCount} regroupement
                {subjectCount !== 1 ? "s" : ""}
                {countryFilter.length > 0 || emergingOnly ? " (filtrés)" : ""}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5 sm:shrink-0 sm:justify-end">
              <Link
                href={`/edition/${editionDate}`}
                className="olj-btn-primary px-4 py-2 text-[13px]"
              >
                Édition du jour
              </Link>
              <Link
                href="/regie/pipeline"
                className="olj-btn-secondary px-4 py-2 text-[13px]"
              >
                Collecte et traitement
              </Link>
              <Link
                href="/articles"
                className="olj-btn-secondary px-4 py-2 text-[13px]"
              >
                Articles (période Beyrouth)
              </Link>
            </div>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-[12px] leading-relaxed text-muted-foreground sm:mx-0">
            Inventaire global et regroupements thématiques (volumes récents, toutes éditions confondues).
            Les statistiques ci-dessous ne sont pas limitées à la fenêtre du sommaire. Pour le livrable daté
            (grands sujets, coches, rédaction), ouvrir l’édition du jour.
          </p>

          {editionWindowOk ? (
            <div className={`mt-5 text-left ${UI_SURFACE_FRise_INSET}`}>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Jour d’édition de référence pour la frise (Beyrouth). L’inventaire et les regroupements ci-dessous
                  restent{" "}
                  <span className="font-medium text-foreground/90">globaux</span> ; seule la fenêtre du sommaire suit
                  le jour choisi (rail + calendrier).
                </p>
                {urlPanoramaDate ? (
                  <Link
                    href="/panorama"
                    className="shrink-0 rounded-full border border-border/50 bg-background px-2.5 py-1 text-center text-[11px] font-medium text-accent transition-colors hover:border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)]"
                  >
                    Aujourd’hui (Beyrouth)
                  </Link>
                ) : null}
              </div>
              <ArticlesPeriodRail
                variant="panorama"
                embedded
                beirutDate={editionDate}
                beirutFrom={null}
                beirutTo={null}
              />
              <div className={UI_SURFACE_FRISE_SEPARATOR}>
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  {editionToday.corpus_article_count != null ? (
                    <p className="text-[12px] text-muted-foreground">
                      Corpus du sommaire (fenêtre d’édition) :{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {editionToday.corpus_article_count}
                      </span>{" "}
                      article
                      {editionToday.corpus_article_count !== 1 ? "s" : ""}
                    </p>
                  ) : null}
                  <p className="text-[11px] italic leading-snug text-muted-foreground sm:max-w-[55%] sm:text-right">
                    Plage du sommaire (Beyrouth), même repère que sur la page Édition
                  </p>
                </div>
                <EditionPeriodFrise
                  windowStartIso={editionToday.window_start!}
                  windowEndIso={editionToday.window_end!}
                  publishRouteIso={editionDate}
                />
              </div>
            </div>
          ) : editionTodayQ.isError ? null : editionTodayQ.isPending ? (
            <div
              className={`mt-5 h-24 w-full max-w-4xl animate-pulse ${UI_SURFACE_SKELETON_INSET}`}
              aria-hidden
            />
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="olj-alert-destructive px-3 py-2 sm:text-left" role="alert">
          {error}
        </p>
      ) : null}

      <StatsCards stats={stats} loading={statsQ.isPending} />

      {stats ? (
        <StatsDistributionPanels
          byCountry={stats.by_country}
          byCountryCode={stats.counts_by_country_code}
          countryLabelsFr={stats.country_labels_fr}
          byLanguage={stats.by_language}
        />
      ) : null}

      <section>
        <h2 className="olj-rubric olj-rule">Regroupements thématiques en cours</h2>
        {!clustersOnlyLoading && clusterRows.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 border-b border-border-light pb-3 text-[12px] text-muted-foreground sm:justify-start">
            <span className="font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              Filtres
            </span>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {countryOptions.map((code) => {
                const on = countryFilter.includes(code);
                const flag = REGION_FLAG_EMOJI[code];
                const name = COUNTRY_LABELS_FR[code] ?? code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setCountryFilter((prev) =>
                        on ? prev.filter((x) => x !== code) : [...prev, code],
                      );
                    }}
                    className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
                  >
                    {flag ? (
                      <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
                        {flag}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setEmergingOnly((v) => !v)}
              className={`${CHIP_BASE} ${emergingOnly ? CHIP_ON : CHIP_OFF}`}
            >
              Seulement nouveaux sujets
            </button>
            {(countryFilter.length > 0 || emergingOnly) && (
              <button
                type="button"
                onClick={() => {
                  setCountryFilter([]);
                  setEmergingOnly(false);
                }}
                className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              >
                Réinitialiser
              </button>
            )}
          </div>
        ) : null}
        {!clustersOnlyLoading &&
        clusterRows.length > 0 &&
        filteredClusters.length === 0 ? (
          <p className="py-10 text-[13px] text-muted-foreground">
            Aucun regroupement ne correspond à ces filtres.
          </p>
        ) : (
          <ClusterList
            clusters={filteredClusters}
            noiseCount={clusters?.noise_count ?? 0}
            loading={clustersOnlyLoading}
          />
        )}
      </section>
    </div>
  );
}
