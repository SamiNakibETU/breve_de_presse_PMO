"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnalyticsSummaryResponse } from "@/lib/types";

const DAY_OPTIONS = [7, 14, 30] as const;

function formatUsd(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export function AnalyticsSection({
  days,
  onDaysChange,
}: {
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const q = useQuery({
    queryKey: ["regieAnalyticsSummary", days] as const,
    queryFn: (): Promise<AnalyticsSummaryResponse> =>
      api.regieAnalyticsSummary(days),
  });

  if (q.isPending) {
    return (
      <section aria-busy="true">
        <h2 className="olj-rubric olj-rule">Analytique et coûts LLM</h2>
        <p className="text-[13px] text-muted-foreground">Chargement des agrégats…</p>
      </section>
    );
  }

  if (q.isError) {
    return (
      <section>
        <h2 className="olj-rubric olj-rule">Analytique et coûts LLM</h2>
        <p className="border-l-2 border-destructive pl-3 text-[13px] text-destructive">
          {q.error.message}
          {" — "}
          Vérifiez la clé API (régie) si l’endpoint est protégé.
        </p>
      </section>
    );
  }

  const data = q.data;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border-light pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="olj-rubric">Analytique et coûts LLM</h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            Requêtes API enregistrées par le serveur (routes normalisées) et appels LLM
            journalisés (curateur, génération de texte revue).{" "}
            <span className="text-foreground/80">{data.note_fr}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Période
          </span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={
                days === d
                  ? "rounded-md border border-accent bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-foreground"
                  : "rounded-md border border-border-light bg-card px-3 py-1.5 text-[12px] text-foreground hover:border-border"
              }
            >
              {d} j
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border-light bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Requêtes API
          </p>
          <p className="mt-1 font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums">
            {data.usage_total.toLocaleString("fr-FR")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Depuis le {new Date(data.since_iso).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div className="rounded-lg border border-border-light bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Appels LLM (journal)
          </p>
          <p className="mt-1 font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums">
            {data.llm_total_calls.toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="rounded-lg border border-border-light bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tokens (estimés)
          </p>
          <p className="mt-1 text-[13px] tabular-nums text-foreground">
            <span className="text-muted-foreground">entrée </span>
            {data.llm_total_input_tokens.toLocaleString("fr-FR")}
          </p>
          <p className="text-[13px] tabular-nums text-foreground">
            <span className="text-muted-foreground">sortie </span>
            {data.llm_total_output_tokens.toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="rounded-lg border border-border-light bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Coût LLM estimé
          </p>
          <p className="mt-1 font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums text-accent">
            {formatUsd(data.llm_total_cost_usd_estimated)}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Requêtes par jour
          </h3>
          {data.usage_by_day.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Aucune donnée sur la période.</p>
          ) : (
            <ul className="space-y-1.5 border border-border-light bg-card p-3 text-[13px]">
              {data.usage_by_day.map((row) => (
                <li
                  key={row.day}
                  className="flex justify-between border-b border-border-light/80 py-1 last:border-b-0"
                >
                  <span className="text-muted-foreground">
                    {new Date(row.day + "T12:00:00Z").toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="tabular-nums font-medium">
                    {row.request_count.toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Routes les plus sollicitées
          </h3>
          {data.usage_top_paths.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Aucune donnée sur la période.</p>
          ) : (
            <ul className="space-y-1.5 border border-border-light bg-card p-3 font-mono text-[12px] leading-snug">
              {data.usage_top_paths.map((row) => (
                <li
                  key={row.path_template}
                  className="flex justify-between gap-3 border-b border-border-light/80 py-1 last:border-b-0"
                >
                  <span className="min-w-0 break-all text-foreground/90">{row.path_template}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {row.request_count.toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
          LLM par jour et modèle
        </h3>
        {data.llm_by_day_model.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Aucun appel enregistré sur la période (curateur / génération revue).
          </p>
        ) : (
          <div className="overflow-x-auto border border-border-light bg-card">
            <table className="w-full min-w-[36rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Jour</th>
                  <th className="px-3 py-2 font-semibold">Modèle</th>
                  <th className="px-3 py-2 font-semibold">Fournisseur</th>
                  <th className="px-3 py-2 text-right font-semibold">Appels</th>
                  <th className="px-3 py-2 text-right font-semibold">Coût est.</th>
                </tr>
              </thead>
              <tbody>
                {data.llm_by_day_model.map((row, i) => (
                  <tr
                    key={`${row.day}-${row.model_used}-${row.provider ?? ""}-${i}`}
                    className="border-b border-border-light last:border-b-0"
                  >
                    <td className="px-3 py-2 text-muted-foreground">{row.day}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-[12px]">
                      {row.model_used}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.provider ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.call_count.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatUsd(row.cost_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
