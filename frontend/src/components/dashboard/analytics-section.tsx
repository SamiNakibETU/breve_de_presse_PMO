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
  showSectionHeading = true,
}: {
  days: number;
  onDaysChange: (d: number) => void;
  showSectionHeading?: boolean;
}) {
  const q = useQuery({
    queryKey: ["regieAnalyticsSummary", days] as const,
    queryFn: (): Promise<AnalyticsSummaryResponse> =>
      api.regieAnalyticsSummary(days),
  });

  if (q.isPending) {
    return (
      <section aria-busy="true">
        {showSectionHeading ? (
          <h2 className="olj-rubric olj-rule">Analytique et coûts LLM</h2>
        ) : null}
        <p className="text-[13px] text-muted-foreground">Chargement des agrégats…</p>
      </section>
    );
  }

  if (q.isError) {
    return (
      <section>
        {showSectionHeading ? (
          <h2 className="olj-rubric olj-rule">Analytique et coûts LLM</h2>
        ) : null}
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
    <section className="space-y-8">
      <div
        className="rounded-md border border-border-light bg-muted/20 p-4 text-[12px] leading-relaxed text-muted-foreground"
        role="note"
      >
        <p className="font-semibold text-foreground">Ledger unifié des coûts</p>
        <p className="mt-2">
          Les lignes proviennent de <code className="text-[11px]">provider_usage_events</code>{" "}
          (traduction multi-fournisseurs, Cohere, curateur, génération revue, détection sujets,
          scoring pertinence, libellés de clusters, gate ingestion). Les montants sont{" "}
          <strong className="text-foreground">estimés</strong>, pas les factures API.
        </p>
        <p className="mt-2 border-t border-border-light pt-3 text-[11px]">{data.note_fr}</p>
      </div>

      <div className="flex flex-col gap-3 border-b border-border-light pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {showSectionHeading ? (
            <h2 className="olj-rubric">Analytique et coûts</h2>
          ) : (
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Synthèse
            </p>
          )}
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            Volume HTTP (middleware) + agrégats du ledger fournisseurs.
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
        </div>
        <div className="rounded-lg border border-border-light bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Appels ledger
          </p>
          <p className="mt-1 font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums">
            {data.provider_total_calls.toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="rounded-lg border border-border-light bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unités (entrée / sortie)
          </p>
          <p className="mt-1 text-[13px] tabular-nums">
            {data.provider_total_input_units.toLocaleString("fr-FR")} /{" "}
            {data.provider_total_output_units.toLocaleString("fr-FR")}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Tokens estimés (LLM) ou équivalent ; sortie embeddings ≈ dim × vecteurs.
          </p>
        </div>
        <div className="rounded-lg border border-border-light bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Coût total estimé
          </p>
          <p className="mt-1 font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums text-accent">
            {formatUsd(data.provider_total_cost_usd)}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Requêtes HTTP par jour
          </h3>
          {data.usage_by_day.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Aucune donnée.</p>
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
            Ledger par jour (coût)
          </h3>
          {data.provider_by_day.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Aucun événement sur la période.</p>
          ) : (
            <ul className="space-y-1.5 border border-border-light bg-card p-3 text-[13px]">
              {data.provider_by_day.map((row) => (
                <li
                  key={row.day}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-light/80 py-1 last:border-b-0"
                >
                  <span className="text-muted-foreground">{row.day}</span>
                  <span className="tabular-nums">
                    <span className="font-medium text-accent">{formatUsd(row.cost_usd)}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      ({row.call_count} appels)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
          Routes HTTP les plus sollicitées
        </h3>
        {data.usage_top_paths.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucune donnée.</p>
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

      <div>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
          Par opération (tri coût décroissant)
        </h3>
        {data.provider_by_operation.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucun événement.</p>
        ) : (
          <div className="overflow-x-auto border border-border-light bg-card">
            <table className="w-full min-w-[40rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Opération</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Appels</th>
                  <th className="px-3 py-2 text-right font-semibold">Coût est.</th>
                  <th className="px-3 py-2 text-right font-semibold">Unités in/out</th>
                </tr>
              </thead>
              <tbody>
                {data.provider_by_operation.map((row) => (
                  <tr
                    key={`${row.operation}-${row.kind}`}
                    className="border-b border-border-light last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-[12px]">{row.operation}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.kind}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.call_count.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-accent">
                      {formatUsd(row.cost_usd)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[12px] text-muted-foreground">
                      {row.input_units.toLocaleString("fr-FR")} /{" "}
                      {row.output_units.toLocaleString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
          Par fournisseur et type
        </h3>
        {data.provider_by_provider.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucun événement.</p>
        ) : (
          <div className="overflow-x-auto border border-border-light bg-card">
            <table className="w-full min-w-[32rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fournisseur</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Appels</th>
                  <th className="px-3 py-2 text-right font-semibold">Coût est.</th>
                </tr>
              </thead>
              <tbody>
                {data.provider_by_provider.map((row) => (
                  <tr
                    key={`${row.provider}-${row.kind}`}
                    className="border-b border-border-light last:border-b-0"
                  >
                    <td className="px-3 py-2 font-medium">{row.provider}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.kind}</td>
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

      <div>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
          Derniers événements (100 max)
        </h3>
        {data.provider_recent.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucun événement.</p>
        ) : (
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto border border-border-light bg-card">
            <table className="w-full min-w-[48rem] text-left text-[12px]">
              <thead className="sticky top-0 border-b border-border bg-muted/40">
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Heure</th>
                  <th className="px-2 py-2 font-semibold">Opération</th>
                  <th className="px-2 py-2 font-semibold">Fournisseur</th>
                  <th className="px-2 py-2 font-semibold">Modèle</th>
                  <th className="px-2 py-2 font-semibold">Statut</th>
                  <th className="px-2 py-2 text-right font-semibold">Coût</th>
                  <th className="px-2 py-2 text-right font-semibold">ms</th>
                </tr>
              </thead>
              <tbody>
                {data.provider_recent.map((row) => (
                  <tr key={row.id} className="border-b border-border-light/80">
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="max-w-[10rem] truncate px-2 py-1.5 font-mono text-[11px]">
                      {row.operation}
                    </td>
                    <td className="px-2 py-1.5">{row.provider}</td>
                    <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                      {row.model}
                    </td>
                    <td className="px-2 py-1.5">{row.status}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatUsd(row.cost_usd_est)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {row.duration_ms ?? "—"}
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
