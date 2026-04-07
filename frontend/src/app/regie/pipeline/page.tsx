"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { PipelineStatusBadge } from "@/components/regie/pipeline-status-badge";
import { api } from "@/lib/api";
import { formatLogTimestampFr } from "@/lib/dates-display-fr";
import {
  durationFromPayload,
  formatPayloadPretty,
  inferPipelineStatus,
} from "@/lib/pipeline-debug-log";
import type {
  AppStatus,
  MediaSourcesHealthResponse,
  PipelineEditionDiagnosticResponse,
} from "@/lib/types";

const SUGGESTED_ACTION_GUIDE_FR: Record<string, string> = {
  embedding_then_clusters:
    "Utilisez les boutons d’étape ci-dessous (ex. embeddings / clusters) sans relancer toute la collecte si le corpus suffit.",
  complete_collection:
    "Lancez une collecte ciblée pour la fenêtre Beyrouth de cette édition avant d’enchaîner traduction et analyse.",
  review_collection_scope:
    "Contrôlez le rattachement des articles à l’édition et le périmètre registre revue (sources actives).",
  pipeline_only:
    "Enchaînez traduction, analyse et détection de sujets via les actions — sans rescrape complet.",
};

export default function RegiePipelinePage() {
  const [revueRegistryOnly, setRevueRegistryOnly] = useState(true);

  const statusQ = useQuery({
    queryKey: ["status"] as const,
    queryFn: (): Promise<AppStatus> => api.status(),
    staleTime: 30_000,
    refetchInterval: (q) =>
      q.state.data?.pipeline_running === true ? 4_000 : false,
  });

  const healthQ = useQuery({
    queryKey: ["mediaSourcesHealth", revueRegistryOnly] as const,
    queryFn: ({
      signal,
    }): Promise<MediaSourcesHealthResponse> =>
      api.mediaSourcesHealth(signal, { revueRegistryOnly }),
  });

  const logsQ = useQuery({
    queryKey: ["regie", "pipeline-debug-logs"] as const,
    queryFn: () => api.regiePipelineDebugLogs({ limit: 80 }),
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diagEditionId, setDiagEditionId] = useState("");
  const [diag, setDiag] = useState<PipelineEditionDiagnosticResponse | null>(
    null,
  );
  const [diagErr, setDiagErr] = useState<string | null>(null);
  const [diagPending, setDiagPending] = useState(false);

  const status = statusQ.data ?? null;
  const sourceHealth = healthQ.data ?? null;

  const firstLog = logsQ.data?.items?.[0];
  const firstKind = firstLog
    ? inferPipelineStatus(firstLog.payload, firstLog.step)
    : null;

  return (
    <div className="space-y-10 text-[13px] leading-relaxed text-foreground-body">
      <header className="space-y-2">
        <p className="olj-rubric">Régie · Production</p>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Collecte et traduction
        </h1>
        <p className="max-w-[52rem] text-[13px] leading-relaxed text-foreground-body">
          Démarrez une étape ci-dessous ; les rapports détaillés et le diagnostic édition suivent sur cette page.
          Journaux LLM :{" "}
          <Link href="/regie/logs" className="underline-offset-4 hover:underline">
            Journaux
          </Link>
          .
        </p>
      </header>

      <section
        id="regie-pipeline-actions"
        className="scroll-mt-8 border-b border-border pb-8"
      >
        <h2 className="olj-rubric olj-rule mb-4">Actions</h2>
        <p className="mb-3 max-w-[52rem] text-[11px] text-muted-foreground">
          Les suggestions du diagnostic édition renvoient ici pour déclencher les tâches sans ambiguïté (collecte vs
          pipeline seul).
        </p>
        <PipelineStatus
          status={status}
          sourceHealth={sourceHealth}
          revueRegistryOnly={revueRegistryOnly}
          onRevueRegistryOnlyChange={setRevueRegistryOnly}
        />
      </section>

      {status?.batch_limits ? (
        <section className="border-b border-border pb-8">
          <h2 className="olj-rubric olj-rule mb-4">Plafonds batch (coûts)</h2>
          <ul className="grid gap-1.5 text-[12px] text-foreground-body sm:grid-cols-2">
            <li>
              Analyse experte :{" "}
              <span className="font-mono">
                {status.batch_limits.article_analysis_batch_limit}
              </span>{" "}
              articles / passage
            </li>
            <li>
              Embeddings :{" "}
              <span className="font-mono">
                {status.batch_limits.embedding_batch_limit}
              </span>{" "}
              / passage
            </li>
            <li>
              Traduction pipeline :{" "}
              <span className="font-mono">
                {status.batch_limits.translation_pipeline_batch_limit}
              </span>
            </li>
            <li>
              Embeddings types éditoriaux seuls :{" "}
              {status.batch_limits.embed_only_editorial_types ? "oui" : "non"}
            </li>
            <li>
              Embeddings registre revue seul :{" "}
              {status.batch_limits.embed_revue_registry_only ? "oui" : "non"}
            </li>
          </ul>
          <p className="mt-2 max-w-[52rem] text-[11px] text-muted-foreground">
            Les rapports d’étape « article_analysis » exposent{" "}
            <code className="rounded bg-muted/40 px-1">deferred_due_to_batch_limit</code>{" "}
            lorsque la file dépasse le plafond. Agrégats tokens / coûts :{" "}
            <Link href="/regie/analytics" className="underline-offset-4 hover:underline">
              Analytique
            </Link>
            .
          </p>
        </section>
      ) : null}

      <section className="border-b border-border pb-8">
        <h2 className="olj-rubric olj-rule mb-4">Diagnostic édition</h2>
        <p className="mb-3 max-w-[52rem] text-[12px] text-muted-foreground">
          UUID d’édition : corpus dans la fenêtre Beyrouth, articles traduits sans
          embedding, et pistes « collecte complète » ou « pipeline seul ».
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-[11px] font-medium text-foreground">
            Édition (UUID)
            <input
              type="text"
              value={diagEditionId}
              onChange={(e) => setDiagEditionId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-…"
              className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[12px]"
            />
          </label>
          <button
            type="button"
            className="olj-btn-secondary px-3 py-2 text-[12px]"
            disabled={diagPending || !diagEditionId.trim()}
            onClick={() => {
              void (async () => {
                const id = diagEditionId.trim();
                if (!id) return;
                setDiagPending(true);
                setDiagErr(null);
                try {
                  const d = await api.editionPipelineDiagnostic(id);
                  setDiag(d);
                } catch (e) {
                  setDiagErr(
                    e instanceof Error ? e.message : "Requête impossible",
                  );
                  setDiag(null);
                } finally {
                  setDiagPending(false);
                }
              })();
            }}
          >
            {diagPending ? "Chargement…" : "Exécuter"}
          </button>
        </div>
        {diagErr ? (
          <p className="olj-alert-destructive mt-2 px-3 py-2 text-[12px]" role="alert">
            {diagErr}
          </p>
        ) : null}
        {diag ? (
          <div className="mt-4 space-y-2 rounded-md border border-border-light bg-muted/15 p-3 text-[12px] text-foreground-body">
            <p>
              <span className="text-muted-foreground">Parution </span>
              {diag.publish_date}
              <span className="text-muted-foreground"> · Articles corpus </span>
              <span className="font-semibold">{diag.corpus_article_count}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Traduits sans embedding </span>
              <span className="font-semibold">
                {diag.translated_pending_embedding}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Dans registre revue </span>
              {diag.corpus_in_revue_registry_count}
              <span className="text-muted-foreground"> · Hors registre </span>
              {diag.corpus_outside_revue_registry_count}
            </p>
            {Object.keys(diag.by_status).length > 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                Statuts :{" "}
                {Object.entries(diag.by_status)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
              </p>
            ) : null}
            <ul className="space-y-3 text-[11px] leading-snug">
              {diag.suggested_actions.map((a) => {
                const guide = SUGGESTED_ACTION_GUIDE_FR[a.id];
                return (
                  <li
                    key={a.id}
                    className="rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                  >
                    <p className="font-medium text-foreground">{a.label_fr}</p>
                    {guide ? (
                      <p className="mt-1 text-muted-foreground">{guide}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px]">
              <a href="#regie-pipeline-actions" className="underline-offset-4 hover:underline">
                Aller aux actions pipeline
              </a>
            </p>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="olj-rubric olj-rule mb-4">Rapports d’étape récents</h2>

        {logsQ.isPending && (
          <p className="text-muted-foreground" role="status">
            Chargement…
          </p>
        )}
        {logsQ.error && (
          <p className="olj-alert-destructive px-3 py-2" role="alert">
            {logsQ.error instanceof Error
              ? logsQ.error.message
              : "Erreur de chargement"}
          </p>
        )}
        {firstLog && firstKind ? (
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-medium text-foreground">Dernier rapport :</span>
            <PipelineStatusBadge kind={firstKind} />
            <span className="text-muted-foreground">{firstLog.step}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatLogTimestampFr(firstLog.created_at)}
            </span>
          </p>
        ) : null}
        {logsQ.data && logsQ.data.items.length === 0 && (
          <p className="text-muted-foreground">Aucune entrée pour l’instant.</p>
        )}
        {logsQ.data && logsQ.data.items.length > 0 && (
          <div className="overflow-x-auto border border-border-light">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-2 py-2 font-medium">Statut</th>
                  <th className="px-2 py-2 font-medium" title="Fuseau UTC">
                    Date (UTC)
                  </th>
                  <th className="px-2 py-2 font-medium">Étape</th>
                  <th className="px-2 py-2 font-medium">Édition</th>
                  <th className="px-2 py-2 font-medium">Payload</th>
                </tr>
              </thead>
              <tbody>
                {logsQ.data.items.map((row) => {
                  const st = inferPipelineStatus(row.payload, row.step);
                  const dur = durationFromPayload(row.payload);
                  const open = expandedId === row.id;
                  const pretty = formatPayloadPretty(row.payload);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border-light align-top"
                    >
                      <td className="px-2 py-2">
                        <PipelineStatusBadge kind={st} />
                        {dur ? (
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            {dur}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[11px] text-muted-foreground tabular-nums">
                        {formatLogTimestampFr(row.created_at)}
                      </td>
                      <td className="px-2 py-2 font-medium text-foreground">
                        {row.step}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {row.edition_id ?? "Non lié"}
                      </td>
                      <td className="max-w-[min(36rem,100%)] px-2 py-2">
                        <button
                          type="button"
                          className="w-full text-left font-mono text-[11px] text-foreground-body hover:text-accent"
                          onClick={() =>
                            setExpandedId(open ? null : row.id)
                          }
                          aria-expanded={open}
                        >
                          {open ? (
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border-light bg-muted/20 p-2 text-[10px]">
                              {pretty}
                            </pre>
                          ) : (
                            <span className="line-clamp-2">
                              {pretty.slice(0, 200)}
                              {pretty.length > 200 ? "…" : ""}
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-border-light px-2 py-2 text-[11px] text-muted-foreground">
              Total : {logsQ.data.total} entrée{logsQ.data.total !== 1 ? "s" : ""}{" "}
              (page limitée à 80). Cliquez sur un aperçu pour déplier le JSON.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
