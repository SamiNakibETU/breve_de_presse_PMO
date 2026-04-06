"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  formatCollectedAtUtcFr,
  formatLogTimestampFr,
  formatUtcDayShortFr,
} from "@/lib/dates-display-fr";
import type { AnalyticsSummaryResponse } from "@/lib/types";

const DAY_OPTIONS = [7, 14, 30] as const;

const BILLING_RECONCILIATION_LINKS: readonly {
  label: string;
  href: string;
  hint: string;
}[] = [
  {
    label: "Anthropic — Console",
    href: "https://platform.claude.com/",
    hint: "Usage et facturation Claude (clé API standard).",
  },
  {
    label: "Anthropic — API Usage & Cost (admin)",
    href: "https://docs.anthropic.com/en/api/data-usage-cost-api",
    hint: "Rapports agrégés ; nécessite une clé admin sk-ant-admin…",
  },
  {
    label: "Groq — Usage",
    href: "https://console.groq.com/dashboard/usage",
    hint: "Conso par période ; pas d’équivalent public type rapport admin.",
  },
  {
    label: "Cohere — Dashboard",
    href: "https://dashboard.cohere.com/",
    hint: "Billing / usage ; billed_units aussi dans les réponses API.",
  },
  {
    label: "Railway — Projet",
    href: "https://railway.app/dashboard",
    hint: "Infra uniquement (compute, Postgres…), pas les coûts LLM.",
  },
];

function formatUsd(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function costSharePercent(costUsd: number, totalUsd: number): string {
  if (totalUsd <= 0) {
    return "—";
  }
  const pct = (costUsd / totalUsd) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function costShareWidthPct(costUsd: number, totalUsd: number): number {
  if (totalUsd <= 0) {
    return 0;
  }
  return Math.min(100, (costUsd / totalUsd) * 100);
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
        <p className="olj-alert-destructive px-3 py-2">
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
      <div className="grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-md border border-border-light bg-muted/20 p-4 text-[12px] leading-relaxed text-muted-foreground"
          role="note"
        >
          <p className="font-semibold text-foreground">Ledger unifié des coûts</p>
          <p className="mt-2">
            Les lignes proviennent de <code className="text-[11px]">provider_usage_events</code>{" "}
            (traduction multi-fournisseurs, Cohere, curateur, génération revue, détection sujets,
            scoring pertinence, libellés de clusters, gate ingestion). Les montants sont{" "}
            <strong className="text-foreground">estimés</strong>, alignés sur les tarifs publics —
            pas la facture fournisseur.
          </p>
          <p className="mt-2 border-t border-border-light pt-3 text-[11px]">{data.note_fr}</p>
        </div>
        <div
          className="rounded-md border border-border-light bg-card p-4 text-[12px] leading-relaxed"
          role="region"
          aria-label="Réconciliation avec les factures fournisseurs"
        >
          <p className="font-semibold text-foreground">Réconciliation facture</p>
          <p className="mt-2 text-muted-foreground">
            Railway n’agrège pas les coûts LLM. Pour comparer ce tableau aux montants réels, ouvrez
            les consoles ci-dessous (même fenêtre de dates que la période choisie, en UTC si
            possible).
          </p>
          <ul className="mt-3 space-y-2">
            {BILLING_RECONCILIATION_LINKS.map((link) => (
              <li key={link.href} className="border-t border-border-light/80 pt-2 first:border-t-0 first:pt-0">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  {link.label}
                </a>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{link.hint}</p>
              </li>
            ))}
          </ul>
        </div>
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
            Volume HTTP (middleware) + agrégats du ledger fournisseurs depuis{" "}
            <time dateTime={data.since_iso} className="tabular-nums">
              {formatCollectedAtUtcFr(data.since_iso)}
            </time>
            .
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

      {data.provider_by_provider.length > 0 && data.provider_total_cost_usd > 0 ? (
        <div>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Répartition estimée du coût (fournisseur · type)
          </h3>
          <div className="space-y-3 rounded-lg border border-border-light bg-card p-4">
            {data.provider_by_provider.map((row) => (
              <div key={`${row.provider}-${row.kind}`}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
                  <span className="font-medium text-foreground">
                    {row.provider}
                    <span className="font-normal text-muted-foreground"> · {row.kind}</span>
                  </span>
                  <span className="tabular-nums text-[12px]">
                    <span className="font-semibold text-accent">{formatUsd(row.cost_usd)}</span>
                    <span className="ml-2 text-muted-foreground">
                      {costSharePercent(row.cost_usd, data.provider_total_cost_usd)}
                    </span>
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="presentation"
                  aria-hidden
                >
                  <div
                    className="h-2 rounded-full bg-accent transition-[width] duration-300"
                    style={{
                      width: `${costShareWidthPct(row.cost_usd, data.provider_total_cost_usd)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
                    {formatUtcDayShortFr(row.day)}
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
            <table className="w-full min-w-[44rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Opération</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Appels</th>
                  <th className="px-3 py-2 text-right font-semibold">Coût est.</th>
                  <th className="px-3 py-2 text-right font-semibold">Part</th>
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
                      {costSharePercent(row.cost_usd, data.provider_total_cost_usd)}
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
            <table className="w-full min-w-[36rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fournisseur</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Appels</th>
                  <th className="px-3 py-2 text-right font-semibold">Coût est.</th>
                  <th className="px-3 py-2 text-right font-semibold">Part</th>
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
                    <td className="px-3 py-2 text-right tabular-nums text-[12px] text-muted-foreground">
                      {costSharePercent(row.cost_usd, data.provider_total_cost_usd)}
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
          Par modèle (tri coût décroissant)
        </h3>
        {data.provider_by_model.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucun événement.</p>
        ) : (
          <div className="overflow-x-auto border border-border-light bg-card">
            <table className="w-full min-w-[48rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fournisseur</th>
                  <th className="px-3 py-2 font-semibold">Modèle</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Appels</th>
                  <th className="px-3 py-2 text-right font-semibold">Coût est.</th>
                  <th className="px-3 py-2 text-right font-semibold">Part</th>
                  <th className="px-3 py-2 text-right font-semibold">Unités in/out</th>
                </tr>
              </thead>
              <tbody>
                {data.provider_by_model.map((row) => (
                  <tr
                    key={`${row.provider}-${row.model}-${row.kind}`}
                    className="border-b border-border-light last:border-b-0"
                  >
                    <td className="px-3 py-2 font-medium">{row.provider}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-[12px] text-muted-foreground">
                      {row.model}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.kind}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.call_count.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-accent">
                      {formatUsd(row.cost_usd)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[12px] text-muted-foreground">
                      {costSharePercent(row.cost_usd, data.provider_total_cost_usd)}
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
          Derniers événements (100 max)
        </h3>
        {data.provider_recent.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucun événement.</p>
        ) : (
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto border border-border-light bg-card">
            <table className="w-full min-w-[48rem] text-left text-[12px]">
              <thead className="sticky top-0 border-b border-border bg-muted/40">
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-semibold" title="Fuseau UTC">
                    Heure (UTC)
                  </th>
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
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground tabular-nums">
                      {formatLogTimestampFr(row.created_at)}
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
