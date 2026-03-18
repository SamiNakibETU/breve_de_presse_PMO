"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppStatus, Stats } from "@/lib/types";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Vue d&apos;ensemble du système de revue de presse
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <StatsCards stats={stats} loading={loading} />

      <div>
        <h2 className="mb-4 text-lg font-semibold">Actions pipeline</h2>
        <PipelineStatus status={status} onRefresh={load} />
      </div>

      {stats && (
        <div className="grid gap-6 lg:grid-cols-2">
          {Object.keys(stats.by_country).length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Articles par pays (24h)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(stats.by_country)
                  .sort(([, a], [, b]) => b - a)
                  .map(([country, count]) => (
                    <div
                      key={country}
                      className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
                    >
                      <span>{country}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {Object.keys(stats.by_language).length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Articles par langue source (24h)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(stats.by_language)
                  .sort(([, a], [, b]) => b - a)
                  .map(([lang, count]) => (
                    <div
                      key={lang}
                      className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
                    >
                      <span className="uppercase">{lang}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
