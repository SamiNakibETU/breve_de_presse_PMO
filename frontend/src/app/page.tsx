"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppStatus, Stats } from "@/lib/types";
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
      setError(
        err instanceof Error ? err.message : "Impossible de contacter le backend"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Tableau de bord
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">
          Revue de presse régionale
        </h1>
        <p className="mt-1 text-[14px] capitalize text-muted-foreground">
          {dateStr}
        </p>
      </header>

      {error && (
        <p className="border-l-2 border-accent pl-4 text-[13px] text-accent">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Statistiques
        </h2>
        <StatsCards stats={stats} loading={loading} />
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Actions pipeline
        </h2>
        <PipelineStatus status={status} onRefresh={load} />
      </section>

      {stats && (
        <div className="grid gap-10 lg:grid-cols-2">
          {Object.keys(stats.by_country).length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                Par pays
              </h2>
              <div className="border-t border-border">
                {Object.entries(stats.by_country)
                  .sort(([, a], [, b]) => b - a)
                  .map(([country, count]) => (
                    <div
                      key={country}
                      className="flex items-baseline justify-between border-b border-border-light px-0 py-2 text-[13px]"
                    >
                      <span>{country}</span>
                      <span className="tabular-nums font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {Object.keys(stats.by_language).length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                Par langue source
              </h2>
              <div className="border-t border-border">
                {Object.entries(stats.by_language)
                  .sort(([, a], [, b]) => b - a)
                  .map(([lang, count]) => (
                    <div
                      key={lang}
                      className="flex items-baseline justify-between border-b border-border-light px-0 py-2 text-[13px]"
                    >
                      <span>{LANG_LABELS[lang] || lang.toUpperCase()}</span>
                      <span className="tabular-nums font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
