"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppStatus, Stats } from "@/lib/types";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";

const LANG_LABELS: Record<string, string> = {
  ar: "Arabe", en: "Anglais", fr: "Français",
  he: "Hébreu", fa: "Persan", tr: "Turc", ku: "Kurde",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, st] = await Promise.all([api.stats(), api.status()]);
      setStats(s);
      setStatus(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          Revue de presse régionale
        </h1>
        <p className="mt-1 text-[13px] capitalize text-[#888]">{dateStr}</p>
      </header>

      {error && (
        <p className="border-l-2 border-[#c8102e] pl-3 text-[13px] text-[#c8102e]">{error}</p>
      )}

      <StatsCards stats={stats} loading={loading} />

      <section>
        <h2 className="mb-3 border-b border-[#dddcda] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Pipeline
        </h2>
        <PipelineStatus status={status} onRefresh={load} />
      </section>

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
                  <div key={country} className="flex items-baseline justify-between border-b border-[#eeede9] py-1.5 text-[13px]">
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
                  <div key={lang} className="flex items-baseline justify-between border-b border-[#eeede9] py-1.5 text-[13px]">
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
