"use client";

import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AppStatus, ClusterListResponse, Stats } from "@/lib/types";
import { ClusterList } from "@/components/clusters/cluster-list";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";

const LANG_LABELS: Record<string, string> = {
  ar: "Arabe",
  en: "Anglais",
  fr: "Français",
  he: "Hébreu",
  fa: "Persan",
  tr: "Turc",
  ku: "Kurde",
};

export default function DashboardPage() {
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

  const loading =
    statsQ.isPending || statusQ.isPending || clustersQ.isPending || healthQ.isPending;
  const error =
    statsQ.error?.message ??
    statusQ.error?.message ??
    clustersQ.error?.message ??
    healthQ.error?.message ??
    null;

  const stats = statsQ.data ?? null;
  const status = statusQ.data ?? null;
  const clusters = clustersQ.data ?? null;

  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subjectCount = clusters?.total ?? 0;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          Sujets du jour
        </h1>
        <p className="mt-1 text-[13px] capitalize text-[#888]">
          {dateStr} · {subjectCount} sujet{subjectCount !== 1 ? "s" : ""}
        </p>
      </header>

      {error && (
        <p className="border-l-2 border-[#c8102e] pl-3 text-[13px] text-[#c8102e]">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 border-b border-[#dddcda] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Pipeline
        </h2>
        <PipelineStatus
          status={status}
          sourceHealth={healthQ.data ?? null}
        />
      </section>

      <section>
        <ClusterList
          clusters={clusters?.clusters ?? []}
          noiseCount={clusters?.noise_count ?? 0}
          loading={loading}
        />
      </section>

      <StatsCards stats={stats} loading={loading} />

      {stats && (
        <div className="grid gap-8 sm:grid-cols-2">
          {Object.keys(stats.by_country).length > 0 && (
            <section>
              <h2 className="mb-2 border-b border-[#dddcda] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
                Par pays
              </h2>
              {Object.entries(stats.by_country)
                .sort(([, a], [, b]) => b - a)
                .map(([country, count]) => (
                  <div
                    key={country}
                    className="flex items-baseline justify-between border-b border-[#eeede9] py-1.5 text-[13px]"
                  >
                    <span>{country}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </div>
                ))}
            </section>
          )}

          {Object.keys(stats.by_language).length > 0 && (
            <section>
              <h2 className="mb-2 border-b border-[#dddcda] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
                Par langue
              </h2>
              {Object.entries(stats.by_language)
                .sort(([, a], [, b]) => b - a)
                .map(([lang, count]) => (
                  <div
                    key={lang}
                    className="flex items-baseline justify-between border-b border-[#eeede9] py-1.5 text-[13px]"
                  >
                    <span>{LANG_LABELS[lang] || lang.toUpperCase()}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </div>
                ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
