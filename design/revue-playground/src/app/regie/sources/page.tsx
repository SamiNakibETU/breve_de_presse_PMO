"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function RegieSourcesPage() {
  const healthQ = useQuery({
    queryKey: ["mediaSourcesHealth", "regie-revue-registry"] as const,
    queryFn: ({ signal }) =>
      api.mediaSourcesHealth(signal, { revueRegistryOnly: true }),
    staleTime: 60_000,
    retry: 1,
  });

  const rows = healthQ.data?.sources ?? [];

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold">
        Santé des sources
      </h1>
      <p className="text-[13px] text-foreground-body">
        Périmètre :{" "}
        <strong className="font-medium text-foreground">
          liste « media revue »
        </strong>{" "}
        (registre <code className="text-[12px]">MEDIA_REVUE_REGISTRY.json</code>
        ). Volumes par source sur les{" "}
        <strong className="font-medium text-foreground">
          {healthQ.data?.window_hours ?? 72} dernières heures
        </strong>{" "}
        (articles collectés). Diagnostic technique · hors chemin critique de
        composition.
      </p>
      {healthQ.isPending && (
        <div className="space-y-2" aria-busy="true" aria-label="Chargement des sources">
          <div className="h-4 w-2/3 max-w-md animate-pulse rounded bg-border" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Pays</th>
                  <th className="py-2 pr-3">72 h</th>
                  <th className="py-2">État</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-light">
                    <td className="py-2 pr-3">
                      <div className="h-4 w-40 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="h-4 w-8 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="h-4 w-10 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2">
                      <div className="h-4 w-16 animate-pulse rounded bg-border" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {healthQ.isError && (
        <p className="text-[13px] text-destructive" role="alert">
          {healthQ.error.message}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Pays</th>
              <th className="py-2 pr-3">72 h</th>
              <th className="py-2">État</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-border-light">
                <td className="py-2 pr-3">{s.name}</td>
                <td className="py-2 pr-3 text-foreground-body">{s.country_code}</td>
                <td className="py-2 pr-3 tabular-nums">{s.articles_72h}</td>
                <td className="py-2 text-foreground-body">{s.health_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
