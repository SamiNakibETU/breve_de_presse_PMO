"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { todayBeirutIsoDate } from "@/lib/beirut-date";
import type { AppStatus, ClusterListResponse, Stats, TopicCluster } from "@/lib/types";
import { ClusterList } from "@/components/clusters/cluster-list";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";

const LANG_LABELS: Record<string, string> = {
  ar: "Arabe",
  en: "Anglais",
  fr: "Français",
  he: "Hébreu",
  fa: "Persan",
  tr: "Turc",
  ku: "Kurde",
};

/** Libellés FR pour les filtres pays (alignés sur la liste Articles). */
const COUNTRY_LABELS_FR: Record<string, string> = {
  LB: "Liban",
  IL: "Israël",
  IR: "Iran",
  AE: "EAU",
  SA: "Arabie saoudite",
  TR: "Turquie",
  IQ: "Irak",
  SY: "Syrie",
  QA: "Qatar",
  JO: "Jordanie",
  EG: "Égypte",
  KW: "Koweït",
  BH: "Bahreïn",
  OM: "Oman",
  DZ: "Algérie",
  ME: "Régional",
  US: "États-Unis",
  GB: "Royaume-Uni",
  FR: "France",
};

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

export default function DashboardPage() {
  const [countryFilter, setCountryFilter] = useState<string[]>([]);
  const [emergingOnly, setEmergingOnly] = useState(false);
  const [statsQ, statusQ, clustersQ, healthQ] = useQueries({
    queries: [
      {
        queryKey: ["stats"] as const,
        queryFn: (): Promise<Stats> => api.stats(),
      },
      {
        queryKey: ["status"] as const,
        queryFn: (): Promise<AppStatus> => api.status(),
      },
      {
        queryKey: ["clusters"] as const,
        queryFn: (): Promise<ClusterListResponse> => api.clusters(),
      },
      {
        queryKey: ["mediaSourcesHealth"] as const,
        queryFn: () => api.mediaSourcesHealth(),
      },
    ],
  });

  const clustersOnlyLoading = clustersQ.isPending;
  const error =
    statsQ.error?.message ??
    statusQ.error?.message ??
    clustersQ.error?.message ??
    healthQ.error?.message ??
    null;

  const stats = statsQ.data ?? null;
  const status = statusQ.data ?? null;
  const clusters = clustersQ.data ?? null;
  const clusterRows = useMemo(
    () => clusters?.clusters ?? [],
    [clusters],
  );

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

  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const editionDate = todayBeirutIsoDate();
  const subjectCount = filteredClusters.length;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          Panorama
        </h1>
        <p className="text-[13px] capitalize text-muted-foreground">
          {dateStr} · {subjectCount} regroupement{subjectCount !== 1 ? "s" : ""}
          {countryFilter.length > 0 || emergingOnly ? " (filtrés)" : ""}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/edition/${editionDate}`}
            className="inline-flex items-center rounded-md border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90"
          >
            Édition du jour
          </Link>
        </div>
        <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Vue d’ensemble des textes en base, indépendante du calendrier d’édition.
          Le sommaire daté se consulte via « Édition du jour ».
        </p>
      </header>

      {error && (
        <p className="border-l-2 border-destructive pl-3 text-[13px] text-destructive">
          {error}
        </p>
      )}

      <StatsCards stats={stats} loading={statsQ.isPending} />

      {stats && (
        <div className="grid gap-6 sm:grid-cols-2">
          {Object.keys(stats.by_country).length > 0 && (
            <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <summary className="cursor-pointer font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground">
                Répartition par pays
              </summary>
              <div className="mt-3 space-y-0">
                {Object.entries(stats.by_country)
                  .sort(([, a], [, b]) => b - a)
                  .map(([country, count]) => (
                    <div
                      key={country}
                      className="flex items-baseline justify-between border-b border-border-light py-2 text-[13px] last:border-b-0"
                    >
                      <span className="text-foreground-body">{country}</span>
                      <span className="tabular-nums font-medium text-foreground">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}

          {Object.keys(stats.by_language).length > 0 && (
            <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <summary className="cursor-pointer font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground">
                Répartition par langue
              </summary>
              <div className="mt-3 space-y-0">
                {Object.entries(stats.by_language)
                  .sort(([, a], [, b]) => b - a)
                  .map(([lang, count]) => (
                    <div
                      key={lang}
                      className="flex items-baseline justify-between border-b border-border-light py-2 text-[13px] last:border-b-0"
                    >
                      <span className="text-foreground-body">
                        {LANG_LABELS[lang] || lang.toUpperCase()}
                      </span>
                      <span className="tabular-nums font-medium text-foreground">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}

      <section>
        <h2 className="olj-rubric olj-rule">Regroupements thématiques en cours</h2>
        {!clustersOnlyLoading && clusterRows.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border-light pb-3 text-[12px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              Filtres
            </span>
            <div className="flex flex-wrap gap-2">
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
                    className={
                      on
                        ? "inline-flex items-center gap-1 border-b-2 border-foreground pb-0.5 font-medium text-foreground"
                        : "inline-flex items-center gap-1 border-b border-transparent pb-0.5 hover:border-border hover:text-foreground"
                    }
                  >
                    {flag ? (
                      <span className="text-[1rem] leading-none" aria-hidden>
                        {flag}
                      </span>
                    ) : null}
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setEmergingOnly((v) => !v)}
              className={
                emergingOnly
                  ? "border-b-2 border-accent pb-0.5 font-medium text-foreground"
                  : "border-b border-transparent pb-0.5 hover:border-border hover:text-foreground"
              }
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
                className="text-[11px] underline decoration-border underline-offset-2 hover:decoration-foreground"
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

      <section>
        <h2 className="olj-rubric olj-rule">Collecte et traitement</h2>
        <PipelineStatus
          status={status}
          sourceHealth={healthQ.data ?? null}
        />
      </section>
    </div>
  );
}
