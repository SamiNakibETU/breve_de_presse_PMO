"use client";

import { useMemo, useState } from "react";

export type PipelineActionKey =
  | "collect"
  | "translate"
  | "refreshClusters"
  | "pipeline";

export interface PipelineRunRecord {
  action: PipelineActionKey;
  label: string;
  ok: boolean;
  durationMs: number;
  /** Réponse API (corps JSON) ou message d’erreur */
  payload: unknown;
  errorMessage?: string;
  at: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Collecte / traduction / pipeline : `{ status, stats }`. Refresh clusters : schéma à plat. */
function extractStats(
  action: PipelineActionKey,
  root: Record<string, unknown>,
): Record<string, unknown> | null {
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
  if (root.status === "ok" && isRecord(root.stats)) {
    return root.stats;
  }
  return null;
}

function num(r: Record<string, unknown>, k: string): number {
  const v = r[k];
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
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
    <div className="flex items-baseline justify-between gap-3 border-b border-[#eeede9] py-1.5 text-[13px] last:border-0">
      <span className="text-[#666]">
        {label}
        {hint && (
          <span className="ml-1 text-[11px] font-normal text-[#aaa]">{hint}</span>
        )}
      </span>
      <span className="shrink-0 tabular-nums font-medium text-[#1a1a1a]">
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
    <div className="mt-3 rounded border border-[#eeede9] bg-[#fafaf8] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888]">
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
        <p className="text-[12px] text-[#c8102e]">{block.error}</p>
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

  return (
    <div className="space-y-1">
      <p className="mb-2 text-[12px] text-[#666]">
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

      {formatScraperStats("Scraping HTTP (BeautifulSoup)", stats.web_scraper)}
      {formatScraperStats("Playwright (pages dynamiques)", stats.playwright_scraper)}

      {errList.length > 0 && (
        <details className="mt-2 text-[12px] text-[#888]">
          <summary className="cursor-pointer text-[#1a1a1a]">
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
  return (
    <div className="space-y-1">
      <p className="mb-2 text-[12px] text-[#666]">
        Traduction + résumé + classification (LLM), jusqu’à 300 articles en file
        (file d’attente : statuts « collected » ou « error » avec contenu).
      </p>
      <Row label="Traités avec succès" value={num(stats, "processed")} />
      <Row label="Échecs LLM / parsing" value={num(stats, "errors")} />
      <Row
        label="Ignorés (trop courts)"
        value={num(stats, "skipped")}
      />
    </div>
  );
}

function RefreshClustersSummary({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-1">
      <p className="mb-2 text-[12px] text-[#666]">
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

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-[#666]">
        Enchaînement automatique : collecte → traduction → embeddings →
        clustering → libellés. Durée totale côté serveur :{" "}
        <strong>{elapsed > 0 ? `${elapsed.toFixed(1)} s` : "—"}</strong>.
      </p>

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
            <p className="text-[12px] text-[#c8102e]">
              {String(stats.embedding.error)}
            </p>
          ) : isRecord(stats.embedding) ? (
            <Row label="Articles embeddés" value={num(stats.embedding, "embedded")} />
          ) : (
            <p className="text-[12px] text-[#888]">{String(stats.embedding)}</p>
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
            <p className="text-[12px] text-[#888]">{String(stats.clustering)}</p>
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
            <p className="text-[12px] text-[#888]">{String(stats.labelling)}</p>
          )}
        </SubBlock>
      )}
    </div>
  );
}

export function PipelineResultPanel({ run }: { run: PipelineRunRecord | null }) {
  const [showRaw, setShowRaw] = useState(false);

  const body = useMemo(() => {
    if (!run) return null;
    if (!run.ok) {
      return (
        <p className="border-l-2 border-[#c8102e] pl-3 text-[13px] text-[#c8102e]">
          {run.errorMessage ?? "Échec"}
        </p>
      );
    }

    const root = run.payload;
    if (!isRecord(root)) {
      return (
        <pre className="text-[11px] text-[#888]">{JSON.stringify(root, null, 2)}</pre>
      );
    }

    const stats = extractStats(run.action, root);
    if (!stats) {
      return (
        <pre className="text-[11px] text-[#888]">
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
        return <PipelineFullSummary stats={stats} />;
    }
  }, [run]);

  if (!run) {
    return (
      <p className="text-[12px] text-[#aaa]">
        Cliquez une action ci-dessus : le résumé apparaît ici (durée réseau +
        traitement serveur).
      </p>
    );
  }

  return (
    <div className="space-y-3 border border-[#dddcda] bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-serif)] text-[16px] font-semibold">
            {run.label}
          </h3>
          <p className="text-[11px] text-[#888]">
            {run.at} · {(run.durationMs / 1000).toFixed(1)} s (mesure navigateur)
            {run.ok ? "" : " · échec"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-[11px] text-[#888] underline hover:text-[#1a1a1a]"
        >
          {showRaw ? "Masquer JSON" : "Voir JSON brut"}
        </button>
      </div>

      {body}

      {showRaw && run.payload !== undefined && (
        <pre className="mt-2 max-h-64 overflow-auto border border-[#eeede9] bg-[#f9f8f5] p-3 text-[10px] leading-relaxed text-[#666]">
          {typeof run.payload === "string"
            ? run.payload
            : JSON.stringify(run.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
