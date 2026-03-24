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
          Aucun regroupement pour l’instant
        </p>
        <p className="mt-2 text-sm">
          Lancez une mise à jour complète depuis la Régie pour collecter, traduire et rapprocher les textes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
        Chaque carte regroupe des textes rapprochés automatiquement (ce n’est pas le sommaire éditorial de
        l’édition). Grille en deux colonnes, tri par pertinence moyenne. Les pastilles « Voix » résument
        des thèses courtes — la fiche détail liste tous les articles et la couverture par pays.
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
          + {noiseCount} article{noiseCount > 1 ? "s" : ""} en marge de ces regroupements
        </div>
      ) : null}
    </div>
  );
}
