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
    <div className="mx-auto max-w-[var(--max-width-page)] px-[var(--spacing-page)] pt-12 pb-20">
      <header className="mb-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Vue d&rsquo;ensemble
        </p>
        <h1 className="mt-2 font-serif text-[2rem] font-semibold leading-[1.2] tracking-tight text-foreground">
          Revue de presse régionale
        </h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {dateStr}
        </p>
      </header>

      {error && (
        <p className="mb-10 border-l-2 border-accent pl-4 font-mono text-[12px] text-accent">
          {error}
        </p>
      )}

      <div className="grid gap-16 lg:grid-cols-[1fr_280px]">
        <div>
          <section className="mb-14">
            <StatsCards stats={stats} loading={loading} />
          </section>

          {stats && (Object.keys(stats.by_country).length > 0 || Object.keys(stats.by_language).length > 0) && (
            <div className="grid gap-12 sm:grid-cols-2">
              {Object.keys(stats.by_country).length > 0 && (
                <section>
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Par pays
                  </h2>
                  <div className="mt-3 space-y-0">
                    {Object.entries(stats.by_country)
                      .sort(([, a], [, b]) => b - a)
                      .map(([country, count]) => (
                        <div
                          key={country}
                          className="flex items-baseline justify-between py-1.5 font-mono text-[12px]"
                        >
                          <span className="text-foreground">{country}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {count}
                          </span>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {Object.keys(stats.by_language).length > 0 && (
                <section>
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Par langue
                  </h2>
                  <div className="mt-3 space-y-0">
                    {Object.entries(stats.by_language)
                      .sort(([, a], [, b]) => b - a)
                      .map(([lang, count]) => (
                        <div
                          key={lang}
                          className="flex items-baseline justify-between py-1.5 font-mono text-[12px]"
                        >
                          <span className="text-foreground">
                            {LANG_LABELS[lang] || lang}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {count}
                          </span>
                        </div>
                      ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <aside className="lg:pl-8 lg:border-l lg:border-border-light/60">
          <PipelineStatus status={status} onRefresh={load} />
        </aside>
      </div>
    </div>
  );
}
