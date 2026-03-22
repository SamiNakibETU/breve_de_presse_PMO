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
        Chaque bloc regroupe des articles proches sémantiquement. Tri par{" "}
        <strong className="font-medium text-foreground-subtle">pertinence moyenne</strong>{" "}
        (ordre décroissant). Le{" "}
        <strong className="font-medium text-foreground-subtle">chapeau</strong> résume la
        première voix ; une <strong className="font-medium text-foreground-subtle">citation</strong>{" "}
        peut provenir d’une seconde source. La page du sujet détaille la matrice pays et les textes.
      </p>

      <ul className="grid list-none grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
