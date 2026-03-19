"use client";

import Link from "next/link";
import type { TopicCluster } from "@/lib/types";

const COUNTRY_FLAGS: Record<string, string> = {
  Liban: "🇱🇧",
  Israël: "🇮🇱",
  Iran: "🇮🇷",
  EAU: "🇦🇪",
  "Émirats Arabes Unis": "🇦🇪",
  "Arabie Saoudite": "🇸🇦",
  Turquie: "🇹🇷",
  Irak: "🇮🇶",
  Syrie: "🇸🇾",
  Qatar: "🇶🇦",
  Koweït: "🇰🇼",
  Jordanie: "🇯🇴",
  Égypte: "🇪🇬",
};

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  return (
    <Link href={`/clusters/${cluster.id}`}>
      <article className="-mx-4 border-b border-[#e5e5e5] px-4 py-6 transition-colors hover:bg-[#fafafa]">
        <h2 className="mb-2 font-[family-name:var(--font-serif)] text-xl">
          {cluster.label || "Cluster sans label"}
        </h2>
        <p className="mb-3 text-sm text-[#666]">
          {cluster.article_count} articles · {cluster.country_count} pays
          {cluster.avg_relevance > 0 && ` · pertinence ${Math.round(cluster.avg_relevance * 100)}%`}
        </p>
        <div className="flex flex-wrap gap-2">
          {cluster.countries.map((country) => (
            <span key={country} className="text-sm">
              {COUNTRY_FLAGS[country] ?? ""} {country}
            </span>
          ))}
        </div>
      </article>
    </Link>
  );
}
