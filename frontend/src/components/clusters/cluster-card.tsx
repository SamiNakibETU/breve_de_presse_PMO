"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import type { TopicCluster } from "@/lib/types";

const PREVIEW_VOICES = 2;
const MAX_COUNTRIES_INLINE = 5;

function formatCountriesLine(countries: string[]): string {
  if (countries.length === 0) return "";
  if (countries.length <= MAX_COUNTRIES_INLINE) {
    return countries.join(" · ");
  }
  const head = countries.slice(0, MAX_COUNTRIES_INLINE);
  const rest = countries.length - MAX_COUNTRIES_INLINE;
  return `${head.join(" · ")} · +${rest}`;
}

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  const queryClient = useQueryClient();
  const href = `/clusters/${cluster.id}`;

  const rawPreviews = cluster.thesis_previews ?? [];
  const voiceRows = rawPreviews.slice(0, PREVIEW_VOICES);
  const extraVoices = Math.max(0, rawPreviews.length - PREVIEW_VOICES);
  const countriesLine = formatCountriesLine(cluster.countries);

  return (
    <Link
      href={href}
      prefetch
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onMouseEnter={() => {
        void queryClient.prefetchQuery({
          queryKey: ["clusterArticles", cluster.id],
          queryFn: () => api.clusterArticles(cluster.id),
        });
      }}
    >
      <article className="border-b border-border-light py-5 transition-colors first:pt-0 hover:bg-muted/30 sm:py-6">
        {cluster.is_emerging ? (
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            Nouveau sujet
          </p>
        ) : null}

        <h2 className="font-[family-name:var(--font-serif)] text-[1.125rem] font-semibold leading-snug text-foreground sm:text-xl">
          {cluster.label || "Sans libellé"}
        </h2>

        {/* Métriques = faits de calibrage, une seule ligne, chiffres tabulaires */}
        <p className="mt-2 text-[11px] tabular-nums tracking-wide text-muted-foreground">
          <span>{cluster.article_count} articles</span>
          <span className="mx-1.5 text-border" aria-hidden>
            ·
          </span>
          <span>{cluster.country_count} pays</span>
          {cluster.avg_relevance > 0 ? (
            <>
              <span className="mx-1.5 text-border" aria-hidden>
                ·
              </span>
              <span>pertinence {Math.round(cluster.avg_relevance * 100)} %</span>
            </>
          ) : null}
        </p>

        {voiceRows.length > 0 ? (
          <div className="mt-4 border-l border-border pl-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Aperçu des voix
            </p>
            <ul className="space-y-3">
              {voiceRows.map((raw, i) => {
                const item =
                  typeof raw === "string"
                    ? {
                        thesis: raw,
                        media_name: null as string | null,
                        article_type: null as string | null,
                      }
                    : raw;
                const th =
                  item.thesis.length > 140
                    ? `${item.thesis.slice(0, 140)}…`
                    : item.thesis;
                const meta = [item.media_name, item.article_type]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={i} className="text-[13px] leading-snug">
                    <p className="font-[family-name:var(--font-serif)] italic text-foreground-subtle">
                      «&nbsp;{th}&nbsp;»
                    </p>
                    {meta ? (
                      <p className="mt-1 font-sans text-[11px] font-normal not-italic text-muted-foreground">
                        {meta}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {extraVoices > 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                +{extraVoices} autre{extraVoices > 1 ? "s" : ""} voix sur la page du sujet
              </p>
            ) : null}
          </div>
        ) : null}

        {countriesLine ? (
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold uppercase tracking-[0.06em] text-muted-foreground/90">
              Pays
            </span>
            <span className="mx-2 text-border" aria-hidden>
              ·
            </span>
            <span>{countriesLine}</span>
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-muted-foreground underline decoration-border underline-offset-[3px] group-hover:text-foreground">
          Ouvrir le sujet
        </p>
      </article>
    </Link>
  );
}
