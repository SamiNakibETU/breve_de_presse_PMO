"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
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
  Oman: "🇴🇲",
  Bahreïn: "🇧🇭",
  Algérie: "🇩🇿",
  régional: "🌍",
};

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  const queryClient = useQueryClient();
  const href = `/clusters/${cluster.id}`;

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={() => {
        void queryClient.prefetchQuery({
          queryKey: ["clusterArticles", cluster.id],
          queryFn: () => api.clusterArticles(cluster.id),
        });
      }}
    >
      <article className="-mx-4 border-b border-border-light px-4 py-6 transition-colors hover:bg-muted/40">
        <h2 className="mb-2 font-[family-name:var(--font-serif)] text-xl text-foreground">
          {cluster.is_emerging && (
            <span className="mr-2 text-[11px] font-sans font-normal text-accent">
              Nouveau sujet
            </span>
          )}
          {cluster.label || "Cluster sans label"}
        </h2>
        <p className="mb-3 text-sm text-foreground-body">
          {cluster.article_count} articles · {cluster.country_count} pays
          {cluster.avg_relevance > 0 && ` · pertinence ${Math.round(cluster.avg_relevance * 100)}%`}
        </p>
        {cluster.thesis_previews && cluster.thesis_previews.length > 0 && (
          <ul className="mb-3 space-y-1 border-l border-border-light pl-3">
            {cluster.thesis_previews.slice(0, 3).map((raw, i) => {
              const item =
                typeof raw === "string"
                  ? { thesis: raw, media_name: null as string | null, article_type: null as string | null }
                  : raw;
              const th = item.thesis.length > 120 ? `${item.thesis.slice(0, 120)}…` : item.thesis;
              const meta = [item.media_name, item.article_type].filter(Boolean).join(" · ");
              return (
                <li
                  key={i}
                  className="font-[family-name:var(--font-serif)] text-[13px] leading-snug text-foreground-subtle"
                >
                  <span className="italic">« {th} »</span>
                  {meta ? (
                    <span className="mt-0.5 block font-sans text-[11px] font-normal not-italic text-muted-foreground">
                      {meta}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          {cluster.countries.map((country) => (
            <span key={country}>
              {COUNTRY_FLAGS[country] ?? ""} {country}
            </span>
          ))}
        </div>
      </article>
    </Link>
  );
}
