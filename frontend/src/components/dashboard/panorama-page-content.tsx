"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { buildPanoramaDayHref } from "@/lib/articles-url-query";
import { todayBeirutIsoDate } from "@/lib/beirut-date";
import { formatIsoCalendarDayLongFr } from "@/lib/dates-display-fr";
import type { ClusterListResponse, Stats, TopicCluster } from "@/lib/types";
import { ClusterList } from "@/components/clusters/cluster-list";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { StatsDistributionPanels } from "@/components/dashboard/stats-distribution-panels";
import { COUNTRY_LABELS_FR } from "@/lib/country-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";

function filterClusters(
  list: TopicCluster[],
  countryCodes: string[],
  emergingOnly: boolean,
): TopicCluster[] {
  let out = list;
  if (emergingOnly) out = out.filter((c) => c.is_emerging === true);
  if (countryCodes.length > 0) {
    out = out.filter((c) => countryCodes.some((code) => c.countries.includes(code)));
  }
  return out;
}

/**
 * Vue Panorama : inventaire, répartitions, clusters — sans bloc pipeline Régie.
 * Design : hero épuré, chips minimalistes avec inversion active.
 */
const CHIP_BASE =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] font-medium leading-tight transition-colors [transition-duration:var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 active:scale-[0.97]";
const CHIP_OFF =
  "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground";
const CHIP_ON = "border-foreground bg-foreground text-background";

export function PanoramaPageContent() {
  const router = useRouter();
  const pathname = usePathname();
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
      { queryKey: ["stats"] as const, queryFn: (): Promise<Stats> => api.stats() },
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
    for (const c of clusterRows) for (const co of c.countries) s.add(co);
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
    editionToday?.window_start && editionToday?.window_end && editionTodayQ.isSuccess;

  return (
    <div className="space-y-8">
      {/* ── HERO ÉPURÉ ─────────────────────────────────────────── */}
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="olj-rubric mb-1">Vue régionale</p>
            <h1 className="font-[family-name:var(--font-serif)] text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">
              Panorama
            </h1>
            <p className="mt-1.5 text-[13px] capitalize text-muted-foreground">
              {dateStr} · {subjectCount} regroupement
              {subjectCount !== 1 ? "s" : ""}
              {countryFilter.length > 0 || emergingOnly ? " · filtrés" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
            <Link href={`/edition/${editionDate}`} className="olj-btn-primary px-3.5 py-1.5 text-[12px]">
              Édition du jour
            </Link>
            <Link href="/articles" className="olj-btn-secondary px-3.5 py-1.5 text-[12px]">
              Articles
            </Link>
            <Link href="/regie/pipeline" className="olj-btn-secondary px-3.5 py-1.5 text-[12px]">
              Pipeline
            </Link>
          </div>
        </div>

        {/* Frise */}
        {editionWindowOk ? (
          <div className="rounded-2xl border border-border/40 bg-background p-4 shadow-low sm:p-5">
            {urlPanoramaDate ? (
              <div className="mb-3 flex justify-end">
                <Link
                  href="/panorama"
                  className="rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-muted/40"
                >
                  Aujourd'hui
                </Link>
              </div>
            ) : null}
            {editionToday.corpus_article_count != null ? (
              <p className="mb-3 text-[11px] text-muted-foreground">
                Sommaire ·{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {editionToday.corpus_article_count}
                </span>{" "}
                article{editionToday.corpus_article_count !== 1 ? "s" : ""}
              </p>
            ) : null}
            <EditionPeriodFrise
              currentIso={editionDate}
              editionWindow={
                editionToday.window_start && editionToday.window_end
                  ? { start: editionToday.window_start, end: editionToday.window_end }
                  : undefined
              }
              unifiedDayNav={(iso) =>
                router.push(buildPanoramaDayHref(pathname, searchParams, iso))
              }
            />
          </div>
        ) : editionTodayQ.isError ? null : editionTodayQ.isPending ? (
          <div
            className="h-20 w-full animate-pulse rounded-2xl border border-border/30 bg-muted/20"
            aria-hidden
          />
        ) : null}
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
        <h2 className="olj-rubric olj-rule">Regroupements</h2>

        {/* Filtres pays — chips minimalistes */}
        {!clustersOnlyLoading && clusterRows.length > 0 ? (
          <div className="mb-5 flex flex-col gap-2.5 border-b border-border-light pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5">
            <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto pb-1 olj-scrollbar-none sm:flex-1 sm:flex-wrap sm:overflow-visible">
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
                      <span className="shrink-0 text-[15px] leading-none" aria-hidden>
                        {flag}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEmergingOnly((v) => !v)}
                className={`${CHIP_BASE} ${emergingOnly ? CHIP_ON : CHIP_OFF}`}
              >
                Nouveaux sujets
              </button>
              {(countryFilter.length > 0 || emergingOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setCountryFilter([]);
                    setEmergingOnly(false);
                  }}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  Tout afficher
                </button>
              )}
            </div>
          </div>
        ) : null}

        {!clustersOnlyLoading && clusterRows.length > 0 && filteredClusters.length === 0 ? (
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
