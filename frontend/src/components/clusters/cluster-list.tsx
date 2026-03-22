"use client";

import type { TopicCluster } from "@/lib/types";
import { ClusterCard } from "./cluster-card";

interface ClusterListProps {
  clusters: TopicCluster[];
  noiseCount: number;
  loading?: boolean;
}

export function ClusterList({ clusters, noiseCount, loading }: ClusterListProps) {
  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p className="text-sm">Chargement…</p>
      </div>
    );
  }
  if (clusters.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p className="font-[family-name:var(--font-serif)] text-lg text-foreground">
          Aucun cluster thématique détecté
        </p>
        <p className="mt-2 text-sm">
          Lancez le pipeline pour collecter et analyser les articles
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
        Chaque carte regroupe des articles proches sémantiquement (deux colonnes pour plus de clarté).
        Tri par{" "}
        <strong className="font-medium text-foreground-subtle">pertinence moyenne</strong>. Rubriques :{" "}
        <strong className="font-medium text-foreground-subtle">chapeau</strong> (1re voix + source),{" "}
        <strong className="font-medium text-foreground-subtle">autre regard</strong> si une 2e thèse
        diffère, puis couverture pays. La page du sujet détaille la matrice et les textes.
      </p>

      <ul className="grid list-none grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        {clusters.map((cluster) => (
          <li key={cluster.id} className="min-w-0">
            <ClusterCard cluster={cluster} />
          </li>
        ))}
      </ul>

      {noiseCount > 0 ? (
        <div className="border-t border-border-light pt-4 text-sm text-muted-foreground">
          + {noiseCount} articles non classés dans ces sujets
        </div>
      ) : null}
    </div>
  );
}
