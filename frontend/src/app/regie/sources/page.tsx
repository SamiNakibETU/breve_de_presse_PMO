"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useCallback, useState } from "react";
import { api } from "@/lib/api";
import { formatLogTimestampFr } from "@/lib/dates-display-fr";
import {
  articlesWindowLabel,
  collecteStatusFr,
  formatLastCollectionSummary,
  formatTranslationHint,
} from "@/lib/media-source-health-display";

export default function RegieSourcesPage() {
  const [revueRegistryOnly, setRevueRegistryOnly] = useState(true);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const healthQ = useQuery({
    queryKey: ["mediaSourcesHealth", "regie", revueRegistryOnly] as const,
    queryFn: ({ signal }) =>
      api.mediaSourcesHealth(signal, { revueRegistryOnly }),
    staleTime: 60_000,
    retry: 1,
  });

  const data = healthQ.data;
  const rows = data?.sources ?? [];
  const wh = data?.window_hours ?? 72;
  const criticalDown = data?.critical_p0_sources_down ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold">
        Vie des sources
      </h1>
      <p className="max-w-3xl text-[13px] leading-relaxed text-foreground-body">
        Même périmètre et libellés que le bloc « État des sources » de la Régie (collecte) : volumes sur{" "}
        <strong className="font-medium text-foreground">{wh} h</strong>, traductions sur{" "}
        <strong className="font-medium text-foreground">24 h</strong> (persistées en base).
      </p>

      <label className="flex max-w-2xl cursor-pointer items-start gap-2 text-[12px] text-foreground-body">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--color-accent)]"
          checked={revueRegistryOnly}
          onChange={(e) => setRevueRegistryOnly(e.target.checked)}
        />
        <span>
          Limiter aux sources du{" "}
          <strong className="font-medium text-foreground-subtle">
            registre revue de presse
          </strong>{" "}
          (<code className="text-[11px]">MEDIA_REVUE_REGISTRY.json</code>
          {data?.revue_registry_count != null ? (
            <>
              ,{" "}
              <span className="tabular-nums">{data.revue_registry_count}</span> entrées dans le JSON
            </>
          ) : null}
          ). Décocher pour toutes les sources techniques.
        </span>
      </label>

      {data?.translation_metrics_note_fr ? (
        <p className="max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
          {data.translation_metrics_note_fr}
        </p>
      ) : null}

      {criticalDown > 0 ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/[0.08] px-4 py-3 text-[12px] leading-relaxed text-foreground-body"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            {criticalDown} source{criticalDown > 1 ? "s" : ""} prioritaire
            {criticalDown > 1 ? "s" : ""} (P0) en difficulté
          </p>
          <p className="mt-1 text-muted-foreground">
            Vérifier la collecte et les journaux pipeline avant publication.
          </p>
        </div>
      ) : null}

      {healthQ.isPending && (
        <div className="space-y-2" aria-busy="true" aria-label="Chargement des sources">
          <div className="h-4 w-2/3 max-w-md animate-pulse rounded bg-border" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="py-2 pr-2" />
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Pays</th>
                  <th className="py-2 pr-3">Volume</th>
                  <th className="py-2 pr-3">Collecte</th>
                  <th className="py-2">Traduction (24 h)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-light">
                    <td className="py-2 pr-2">
                      <div className="h-4 w-4 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="h-4 w-40 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="h-4 w-8 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="h-4 w-28 animate-pulse rounded bg-border" />
                    </td>
                    <td className="py-2">
                      <div className="h-4 w-32 animate-pulse rounded bg-border" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {healthQ.isError && (
        <p className="olj-alert-destructive px-3 py-2" role="alert">
          {healthQ.error.message}
        </p>
      )}

      {!healthQ.isPending && !healthQ.isError && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <th className="w-8 py-2 pr-2" aria-label="Détails" />
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Pays</th>
                <th
                  className="py-2 pr-3"
                  title={`Articles collectés sur les ${wh} dernières heures (fenêtre API)`}
                >
                  Volume ({wh} h)
                </th>
                <th className="py-2 pr-3">État collecte</th>
                <th className="py-2">Traduction (24 h)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Aucune source dans ce périmètre.
                  </td>
                </tr>
              ) : (
                rows.map((s) => {
                  const open = expandedIds.has(s.id);
                  const { label: statusLabel, rowClass } = collecteStatusFr(
                    s.health_status,
                  );
                  const trad = formatTranslationHint(s);
                  const lc = formatLastCollectionSummary(s.last_collection);
                  const statusTone =
                    s.health_status === "dead"
                      ? "text-destructive"
                      : s.health_status === "degraded"
                        ? "text-warning"
                        : "text-foreground-body";
                  const alias =
                    s.alias_aggregate_ids && s.alias_aggregate_ids.length > 0
                      ? s.alias_aggregate_ids.join(", ")
                      : null;
                  const lastIngested =
                    s.last_collected_at?.trim() != null &&
                    s.last_collected_at.trim() !== ""
                      ? formatLogTimestampFr(s.last_collected_at.trim())
                      : null;
                  return (
                    <Fragment key={s.id}>
                      <tr className={`border-b border-border-light ${rowClass}`}>
                        <td className="py-2 pr-2 align-top">
                          <button
                            type="button"
                            className="olj-focus rounded p-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-expanded={open}
                            aria-controls={`source-detail-${s.id}`}
                            onClick={() => toggleExpanded(s.id)}
                          >
                            {open ? "−" : "+"}
                          </button>
                        </td>
                        <td className="py-2 pr-3 align-top font-[family-name:var(--font-serif)] font-medium text-foreground">
                          {s.name}
                        </td>
                        <td className="py-2 pr-3 align-top text-foreground-body">
                          {s.country_code}
                        </td>
                        <td className="py-2 pr-3 align-top tabular-nums text-foreground-body">
                          {articlesWindowLabel(s.articles_72h, wh)}
                        </td>
                        <td className={`py-2 pr-3 align-top text-[12px] ${statusTone}`}>
                          {statusLabel}
                        </td>
                        <td className="py-2 align-top text-[12px] text-muted-foreground">
                          {trad ?? "—"}
                        </td>
                      </tr>
                      {open ? (
                        <tr
                          key={`${s.id}-detail`}
                          className="border-b border-border-light bg-muted/10"
                        >
                          <td />
                          <td
                            id={`source-detail-${s.id}`}
                            colSpan={5}
                            className="pb-3 pt-0 pr-3 text-[11px] leading-relaxed text-muted-foreground"
                          >
                            <div className="space-y-1.5 pl-0.5">
                              {lc ? <p>{lc}</p> : null}
                              {lastIngested ? (
                                <p>
                                  Dernier article ingéré (réf.) :{" "}
                                  <span className="text-foreground-body">
                                    {lastIngested}
                                  </span>
                                </p>
                              ) : null}
                              {alias ? (
                                <p>
                                  Agrégation compteurs avec d’autres IDs :{" "}
                                  <code className="text-[10px]">{alias}</code>
                                </p>
                              ) : null}
                              {s.consecutive_empty_collection_runs != null &&
                              s.consecutive_empty_collection_runs > 0 ? (
                                <p className="text-warning">
                                  Séries de collectes vides :{" "}
                                  <span className="tabular-nums">
                                    {s.consecutive_empty_collection_runs}
                                  </span>
                                </p>
                              ) : null}
                              {!lc &&
                              !lastIngested &&
                              !alias &&
                              (s.consecutive_empty_collection_runs == null ||
                                s.consecutive_empty_collection_runs === 0) ? (
                                <p>Aucun détail supplémentaire.</p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
