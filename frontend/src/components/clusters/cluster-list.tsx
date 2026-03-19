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
      <div className="py-12 text-center text-[#999]">
        <p className="text-sm">Chargement…</p>
      </div>
    );
  }
  if (clusters.length === 0) {
    return (
      <div className="py-12 text-center text-[#999]">
        <p className="font-[family-name:var(--font-serif)] text-lg">
          Aucun cluster thématique détecté
        </p>
        <p className="mt-2 text-sm">
          Lancez le pipeline pour collecter et analyser les articles
        </p>
      </div>
    );
  }

  return (
    <div>
      {clusters.map((cluster) => (
        <ClusterCard key={cluster.id} cluster={cluster} />
      ))}
      {noiseCount > 0 && (
        <div className="py-4 text-sm text-[#999]">
          + {noiseCount} articles non classés
        </div>
      )}
    </div>
  );
}
