"use client";

import { useEffect, useMemo, useState } from "react";

export type PipelineActionKey =
  | "collect"
  | "translate"
  | "refreshClusters"
  | "pipeline"
  | "resumePipeline"
  | "relevanceScoring"
  | "articleAnalysis"
  | "dedupSurface"
  | "syndicationSimhash"
  | "dedupSemantic"
  | "embeddingOnly"
  | "clusteringOnly"
  | "clusterLabelling"
  | "topicDetection";

export interface PipelineRunRecord {
  action: PipelineActionKey;
  label: string;
  ok: boolean;
  durationMs: number;
  /** Réponse API (corps JSON) ou message d’erreur */
  payload: unknown;
  errorMessage?: string;
  at: string;
  /** Identifiant tâche async (debug / support). */
  taskId?: string;
  /** Détails techniques (HTTP, polling, réseau). */
  errorDetailLines?: string[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Collecte / traduction / pipeline : `{ status, stats }`. Refresh clusters : schéma à plat. */
function extractStats(
  action: PipelineActionKey,
  root: Record<string, unknown>,
): Record<string, unknown> | null {
  if (action === "collect" || action === "translate") {
    if (root.status === "ok" && isRecord(root.stats)) {
      return root.stats;
    }
    return null;
  }
  if (action === "refreshClusters") {
    if (
      "articles_embedded" in root ||
      "clusters_created" in root ||
      "articles_clustered" in root
    ) {
      return root;
    }
    return null;
  }
  const pipelineLike = action === "pipeline" || action === "resumePipeline";
  if (pipelineLike && root.status === "ok" && isRecord(root.stats)) {
    return root.stats;
  }
  return null;
}

function num(r: Record<string, unknown>, k: string): number {
  const v = r[k];
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

function formatElapsedSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

/** Étapes typiques côté serveur (informatif — pas de signal temps réel aujourd’hui). */
const TYPICAL_SERVER_STEPS: Record<PipelineActionKey, string[]> = {
  relevanceScoring: [
    "Score de pertinence pour la revue sur le corpus de l’édition cible",
  ],
  articleAnalysis: [
    "Analyse LLM article par article (5 puces, thèse, etc.) — textes déjà traduits",
  ],
  dedupSurface: [
    "Repérage des doublons évidents (recouvrement texte de surface)",
  ],
  syndicationSimhash: [
    "Simhash sur résumés et corps pour marquer les dépêches reprises",
  ],
  dedupSemantic: [
    "Dédoublonnage sémantique (après vecteurs à jour)",
  ],
  embeddingOnly: [
    "Calcul des embeddings Cohere pour les articles en attente",
  ],
  clusteringOnly: [
    "Regroupement HDBSCAN sur les vecteurs",
  ],
  clusterLabelling: [
    "Libellés LLM pour les clusters sans titre",
  ],
  topicDetection: [
    "Grands sujets du sommaire pour l’édition (LLM) — pas les petits clusters thématiques",
  ],
  collect: [
    "Lecture des flux RSS pour chaque média actif",
    "Filtrage éditorial (périmètre / titres)",
    "Enregistrement des articles et journaux de collecte",
    "Éventuellement : scraping HTTP ou Playwright selon la configuration",
  ],
  translate: [
    "Sélection des articles à traiter (file, jusqu’à 300)",
    "Appels LLM : titre FR, résumés, type d’article",
    "Mise à jour des articles en base",
  ],
  refreshClusters: [
    "Embeddings pour les articles sans vecteur (Cohere)",
    "Regroupement (HDBSCAN) et mise à jour des clusters",
    "Libellés pour les regroupements sans titre — sans collecte, traduction ni grands sujets d’édition",
  ],
  pipeline: [
    "Collecte RSS / scrapers",
    "Traduction et résumés (LLM)",
    "Embeddings et clustering",
    "Libellés des sujets",
  ],
  resumePipeline: [
    "Reprise : collecte et traduction peuvent être ignorées si déjà enregistrées ce jour",
    "Puis enchaînement relevance, dédup, embeddings, clustering, sujets",
  ],
};

function PipelineRunningProgress({
  label,
  actionKey,
  serverLiveStep,
}: {
  label: string;
  actionKey: PipelineActionKey;
  /** Libellé renvoyé par le serveur (polling) — ex. collecte asynchrone. */
  serverLiveStep?: string | null;
}) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setElapsedSec(0);
    const id = setInterval(() => {
      setElapsedSec((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [actionKey]);

  const steps = TYPICAL_SERVER_STEPS[actionKey];

  return (
    <div className="space-y-3 border border-border bg-muted/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground">
          {label} en cours…
        </p>
        <p
          className="tabular-nums text-[13px] font-medium text-foreground-subtle"
          aria-live="polite"
          aria-atomic="true"
        >
          Temps écoulé : {formatElapsedSeconds(elapsedSec)}
        </p>
      </div>

      <div className="olj-progress-track" role="progressbar" aria-label="Traitement en cours">
        <div className="olj-progress-indeterminate" />
      </div>

      {serverLiveStep ? (
        <p
          className="border border-accent/20 bg-card px-3 py-2.5 text-[13px] leading-snug text-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            Étape côté serveur
          </span>
          {serverLiveStep}
        </p>
      ) : null}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {serverLiveStep ? (
          <>
            L’étape affichée est rafraîchie par <strong>polling</strong> (intervalle
            progressif). Ce n’est <strong>pas</strong> un pourcentage d’avancement ni
            une estimation du temps restant.
          </>
        ) : (
          <>
            En attendant la première réponse de suivi, cette barre indique que la
            tâche est lancée côté serveur.
          </>
        )}
      </p>

      <p className="text-[12px] leading-relaxed text-foreground-body">
        Le résumé chiffré s’affichera ici à la fin. Vous pouvez{" "}
        <strong>changer de page</strong> ou <strong>fermer puis rouvrir l’onglet</strong>{" "}
        : le traitement continue sur le serveur ; une barre en tête de site indique
        l’activité et la reprise automatique fonctionne après rechargement.
      </p>

      <details className="text-[12px] text-foreground-body">
        <summary className="cursor-pointer text-foreground underline decoration-border underline-offset-2">
          Ordre d’exécution typique côté serveur
        </summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[11px] leading-relaxed text-foreground-body">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-light py-1.5 text-[13px] last:border-0">
      <span className="text-foreground-body">
        {label}
        {hint && (
          <span className="ml-1 text-[11px] font-normal text-muted-foreground/80">{hint}</span>
        )}
      </span>
      <span className="shrink-0 tabular-nums font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function SubBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded border border-border-light bg-muted/60 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function formatScraperStats(
  label: string,
  block: unknown,
): React.ReactNode {
  if (!isRecord(block)) return null;
  if ("error" in block && typeof block.error === "string") {
    return (
      <SubBlock title={label}>
        <p className="olj-alert-destructive px-2 py-1.5 text-[12px]" role="alert">
          {block.error}
        </p>
      </SubBlock>
    );
  }
  return (
    <SubBlock title={label}>
      <Row label="Nouveaux articles" value={num(block, "total_new")} />
      <Row label="Filtrés (hors périmètre)" value={num(block, "total_filtered")} />
      <Row label="Sources traitées" value={num(block, "total_sources")} />
    </SubBlock>
  );
}

function CollectSummary({ stats }: { stats: Record<string, unknown> }) {
  const errors = stats.errors;
  const errList = Array.isArray(errors) ? errors : [];
  const collBreakdown = stats.error_breakdown;
  const hasCollBreakdown =
    isRecord(collBreakdown) && Object.keys(collBreakdown).length > 0;

  return (
    <div className="space-y-1">
      <p className="mb-2 text-[12px] text-foreground-body">
        Flux RSS actifs, puis scrapers web et Playwright (si configurés).
      </p>
      <Row
        label="Nouveaux articles (total)"
        value={num(stats, "total_new")}
        hint="en base, statut « collecté »"
      />
      <Row
        label="Filtrés (non-périmètre)"
        value={num(stats, "total_filtered")}
        hint="hors sujet crise / filtre titres"
      />
      <Row label="Sources RSS lancées" value={num(stats, "total_sources")} />
      <Row label="Erreurs source" value={errList.length} />

      {hasCollBreakdown && (
        <div className="mt-2 border-t border-border-light pt-2">
          <p className="mb-1 text-[11px] font-medium text-foreground-subtle">
            Répartition erreurs collecte
          </p>
          <ul className="list-inside list-disc text-[11px] text-foreground-body">
            {Object.entries(collBreakdown as Record<string, number>).map(
              ([k, v]) => (
                <li key={k}>
                  <span className="font-mono">{k}</span> : {v}
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {formatScraperStats("Scraping HTTP (BeautifulSoup)", stats.web_scraper)}
      {formatScraperStats("Playwright (pages dynamiques)", stats.playwright_scraper)}

      {errList.length > 0 && (
        <details className="mt-2 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer text-foreground">
            Détail des erreurs ({errList.length})
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px]">
            {errList.slice(0, 20).map((e, i) => (
              <li key={i}>
                {isRecord(e) && typeof e.source === "string"
                  ? `${e.source}: `
                  : ""}
                {isRecord(e) && typeof e.error === "string"
                  ? e.error
                  : String(e)}
              </li>
            ))}
            {errList.length > 20 && (
              <li>… +{errList.length - 20} autres</li>
            )}
          </ul>
        </details>
      )}
    </div>
  );
}

function TranslateSummary({ stats }: { stats: Record<string, unknown> }) {
  const breakdown = stats.error_breakdown;
  const samples = stats.error_samples;
  const hasBreakdown =
    isRecord(breakdown) && Object.keys(breakdown).length > 0;
  const hasSamples = Array.isArray(samples) && samples.length > 0;

  return (
    <div className="space-y-1">
      <p className="mb-2 text-[12px] text-foreground-body">
        Traduction + résumé + classification (LLM), jusqu’à 300 articles en file
        (statuts « collected » ou « error » ; exclus après plusieurs échecs — variable
        d’environnement{" "}
        <code className="font-mono text-[10px]">MAX_TRANSLATION_FAILURES</code>
        ).
      </p>
      <Row label="Traités avec succès" value={num(stats, "processed")} />
      <Row label="À relire (confiance basse)" value={num(stats, "needs_review")} />
      <Row label="Échecs LLM / parsing" value={num(stats, "errors")} />
      <Row
        label="Ignorés (trop courts)"
        value={num(stats, "skipped")}
      />
      {hasBreakdown && (
        <div className="mt-2 border-t border-border-light pt-2">
          <p className="mb-1 text-[11px] font-medium text-foreground-subtle">
            Répartition des échecs
          </p>
          <ul className="list-inside list-disc text-[11px] text-foreground-body">
            {Object.entries(breakdown as Record<string, number>).map(
              ([k, v]) => (
                <li key={k}>
                  <span className="font-mono">{k}</span> : {v}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
      {hasSamples && (
        <div className="mt-2 border-t border-border-light pt-2">
          <p className="mb-1 text-[11px] font-medium text-foreground-subtle">
            Exemples (max. 8)
          </p>
          <ul className="space-y-1 text-[10px] text-foreground-body">
            {(samples as Record<string, string>[]).map((s, i) => (
              <li
                key={i}
                className="break-words rounded border border-border/50 bg-muted/30 px-2 py-1"
              >
                <span className="font-mono text-foreground">{s.reason}</span>
                {s.article_id ? ` · ${s.article_id}` : ""}
                {s.message ? (
                  <span className="block text-muted-foreground">{s.message}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RefreshClustersSummary({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-1">
      <p className="mb-2 text-[12px] text-foreground-body">
        Embeddings (Cohere) sur articles sans vecteur, puis HDBSCAN + labels LLM
        sur les clusters sans titre.
      </p>
      <Row label="Articles embeddés" value={num(stats, "articles_embedded")} />
      <Row label="Articles regroupés" value={num(stats, "articles_clustered")} />
      <Row label="Clusters créés" value={num(stats, "clusters_created")} />
      <Row label="Clusters étiquetés" value={num(stats, "clusters_labeled")} />
    </div>
  );
}

function PipelineFullSummary({ stats }: { stats: Record<string, unknown> }) {
  const elapsed = num(stats, "elapsed_seconds");
  const timings = stats.step_timings;
  const hasTimings = isRecord(timings) && Object.keys(timings).length > 0;

  if (stats.skipped === true) {
    const reason =
      typeof stats.reason === "string" ? stats.reason : "";
    let msg: string;
    switch (reason) {
      case "pipeline_already_complete_today":
        msg =
          "Le pipeline du jour est déjà terminé (résumé présent dans les journaux) — aucune action.";
        break;
      case "pipeline_already_running":
        msg =
          "Un autre passage était déjà en cours — ce déclenchement a été ignoré.";
        break;
      default:
        msg = reason
          ? `Reprise sans enchaînement complet : ${reason}.`
          : "Reprise sans enchaînement complet.";
    }
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-foreground-body">{msg}</p>
      </div>
    );
  }

  if (
    typeof stats.error === "string" &&
    stats.error === "pipeline_timeout"
  ) {
    return (
      <div className="space-y-2">
        <p className="olj-alert-destructive px-2 py-1.5 text-[12px]" role="alert">
          Durée maximale dépassée (timeout serveur). Relancez une reprise manuelle
          ou attendez les tentatives automatiques si elles sont configurées côté
          serveur.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-foreground-body">
        Enchaînement automatique : collecte → traduction → embeddings →
        clustering → libellés. Durée totale côté serveur :{" "}
        <strong>{elapsed > 0 ? `${elapsed.toFixed(1)} s` : "—"}</strong>.
      </p>

      {hasTimings && (
        <div className="rounded border border-border-light bg-muted/60 p-2 text-[11px] text-foreground-body">
          <p className="mb-1 font-medium text-foreground-subtle">Durées par étape (s)</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
            {Object.entries(timings as Record<string, number>).map(([k, v]) => (
              <li key={k}>
                {k}: {typeof v === "number" ? v.toFixed(2) : String(v)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isRecord(stats.collection) && (
        <SubBlock title="1. Collecte">
          <CollectSummary stats={stats.collection} />
        </SubBlock>
      )}

      {isRecord(stats.translation) && (
        <SubBlock title="2. Traduction">
          <TranslateSummary stats={stats.translation} />
        </SubBlock>
      )}

      {stats.embedding !== undefined && (
        <SubBlock title="3. Embeddings">
          {isRecord(stats.embedding) && "error" in stats.embedding ? (
            <p className="olj-alert-destructive px-2 py-1.5 text-[12px]" role="alert">
              {String(stats.embedding.error)}
            </p>
          ) : isRecord(stats.embedding) ? (
            <Row label="Articles embeddés" value={num(stats.embedding, "embedded")} />
          ) : (
            <p className="text-[12px] text-muted-foreground">{String(stats.embedding)}</p>
          )}
        </SubBlock>
      )}

      {stats.clustering !== undefined && (
        <SubBlock title="4. Clustering">
          {isRecord(stats.clustering) ? (
            <>
              <Row
                label="Clusters actifs"
                value={num(stats.clustering, "clusters_created")}
              />
              <Row
                label="Articles dans un cluster"
                value={num(stats.clustering, "articles_clustered")}
              />
              <Row
                label="Hors cluster (bruit)"
                value={num(stats.clustering, "noise_articles")}
              />
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">{String(stats.clustering)}</p>
          )}
        </SubBlock>
      )}

      {stats.labelling !== undefined && (
        <SubBlock title="5. Libellés sujets">
          {isRecord(stats.labelling) ? (
            <Row
              label="Clusters nommés par le LLM"
              value={num(stats.labelling, "labeled")}
            />
          ) : (
            <p className="text-[12px] text-muted-foreground">{String(stats.labelling)}</p>
          )}
        </SubBlock>
      )}
    </div>
  );
}

export function PipelineResultPanel({
  run,
  running,
}: {
  run: PipelineRunRecord | null;
  /** Action en cours : le résumé n’existe qu’après la réponse HTTP (souvent longue). */
  running?: {
    key: PipelineActionKey;
    label: string;
    /** Polling : libellé d’étape renvoyé par l’API (collecte async). */
    serverLiveStep?: string | null;
  } | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const body = useMemo(() => {
    if (!run) return null;
    if (!run.ok) {
      return (
        <div className="olj-alert-destructive space-y-3 p-3">
          <p className="font-medium">
            {run.errorMessage ?? "Échec"}
          </p>
          {run.taskId ? (
            <p className="font-mono text-[11px] text-foreground-body">
              Tâche (id) : {run.taskId}
            </p>
          ) : null}
          {run.errorDetailLines && run.errorDetailLines.length > 0 ? (
            <details className="text-[11px] text-foreground-subtle">
              <summary className="cursor-pointer text-foreground underline decoration-border underline-offset-2">
                Détails techniques ({run.errorDetailLines.length} lignes)
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all border border-border-light bg-muted/60 p-2 text-[10px] leading-relaxed text-foreground">
                {run.errorDetailLines.join("\n")}
              </pre>
            </details>
          ) : null}
        </div>
      );
    }

    const root = run.payload;
    if (!isRecord(root)) {
      return (
        <pre className="text-[11px] text-muted-foreground">{JSON.stringify(root, null, 2)}</pre>
      );
    }

    const stats = extractStats(run.action, root);
    if (!stats) {
      return (
        <pre className="text-[11px] text-muted-foreground">
          {JSON.stringify(root, null, 2)}
        </pre>
      );
    }

    switch (run.action) {
      case "collect":
        return <CollectSummary stats={stats} />;
      case "translate":
        return <TranslateSummary stats={stats} />;
      case "refreshClusters":
        return <RefreshClustersSummary stats={stats} />;
      case "pipeline":
      case "resumePipeline":
        return <PipelineFullSummary stats={stats} />;
    }
  }, [run]);

  if (running) {
    return (
      <PipelineRunningProgress
        label={running.label}
        actionKey={running.key}
        serverLiveStep={running.serverLiveStep ?? null}
      />
    );
  }

  if (!run) {
    return (
      <p className="text-[12px] text-muted-foreground/80">
        Cliquez une action ci-dessus : le résumé apparaît ici (durée réseau +
        traitement serveur).
      </p>
    );
  }

  return (
    <div className="space-y-3 border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-serif)] text-[16px] font-semibold">
            {run.label}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {run.at} · {(run.durationMs / 1000).toFixed(1)} s (mesure navigateur)
            {run.ok ? "" : " · échec"}
          </p>
          {run.taskId ? (
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
              Tâche : {run.taskId}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          {showRaw ? "Masquer JSON" : "Voir JSON brut"}
        </button>
      </div>

      {body}

      {showRaw && run.payload !== undefined && (
        <pre className="mt-2 max-h-64 overflow-auto border border-border-light bg-background p-3 text-[10px] leading-relaxed text-foreground-body">
          {typeof run.payload === "string"
            ? run.payload
            : JSON.stringify(run.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
