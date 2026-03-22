"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ThesisPreviewItem, TopicCluster } from "@/lib/types";
import { ClusterCountryStrip } from "./cluster-country-strip";

const MAX_DECK = 168;
const MAX_COUNTRIES_TEXT = 4;

function normalizePreview(
  raw: string | ThesisPreviewItem,
): { thesis: string; media_name: string | null; article_type: string | null } {
  if (typeof raw === "string") {
    return { thesis: raw, media_name: null, article_type: null };
  }
  return {
    thesis: raw.thesis,
    media_name: raw.media_name ?? null,
    article_type: raw.article_type ?? null,
  };
}

function deckFromThesis(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= MAX_DECK) return t;
  return `${t.slice(0, MAX_DECK).trim()}…`;
}

function formatFreshness(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function countriesShortLine(countries: string[]): string {
  if (countries.length === 0) return "";
  const head = countries.slice(0, MAX_COUNTRIES_TEXT);
  const rest = countries.length - head.length;
  return rest > 0 ? `${head.join(" · ")} · +${rest}` : head.join(" · ");
}

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  const queryClient = useQueryClient();
  const href = `/clusters/${cluster.id}`;

  const rawPreviews = cluster.thesis_previews ?? [];
  const first = rawPreviews[0] ? normalizePreview(rawPreviews[0]) : null;
  const second = rawPreviews[1] ? normalizePreview(rawPreviews[1]) : null;

  const deck = first ? deckFromThesis(first.thesis) : null;
  const pullQuote =
    second && second.thesis.trim().length > 0
      ? second.thesis.length > 120
        ? `${second.thesis.slice(0, 120).trim()}…`
        : second.thesis
      : null;
  const pullMeta = second
    ? [second.media_name, second.article_type].filter(Boolean).join(" · ")
    : "";

  const freshness = formatFreshness(cluster.latest_article_at);
  const countriesText = countriesShortLine(cluster.countries);

  return (
    <Link
      href={href}
      prefetch
      className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onMouseEnter={() => {
        void queryClient.prefetchQuery({
          queryKey: ["clusterArticles", cluster.id],
          queryFn: () => api.clusterArticles(cluster.id),
        });
      }}
    >
      <article className="flex h-full flex-col border border-border-light bg-card/40 p-4 transition-colors hover:bg-muted/35 sm:p-5">
        {cluster.is_emerging ? (
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            Nouveau sujet
          </p>
        ) : null}

        <h2 className="font-[family-name:var(--font-serif)] text-[1.05rem] font-semibold leading-snug text-foreground sm:text-[1.15rem]">
          {cluster.label || "Sans libellé"}
        </h2>

        {deck ? (
          <p
            className="mt-3 text-[13px] leading-relaxed text-foreground-body line-clamp-3"
            title={first?.thesis}
          >
            {deck}
          </p>
        ) : (
          <p className="mt-3 text-[12px] italic text-muted-foreground">
            Aperçu textuel indisponible — ouvrez le sujet pour les articles.
          </p>
        )}

        <p className="mt-3 text-[11px] tabular-nums tracking-wide text-muted-foreground">
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
          {freshness ? (
            <>
              <span className="mx-1.5 text-border" aria-hidden>
                ·
              </span>
              <span className="whitespace-nowrap">fraîcheur {freshness}</span>
            </>
          ) : null}
        </p>

        {pullQuote ? (
          <div className="mt-4 border-l-2 border-accent/25 pl-3">
            <p className="font-[family-name:var(--font-serif)] text-[12px] italic leading-snug text-foreground-subtle">
              «&nbsp;{pullQuote}&nbsp;»
            </p>
            {pullMeta ? (
              <p className="mt-1 text-[10px] text-muted-foreground">{pullMeta}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 space-y-2 border-t border-border-light pt-3">
          <ClusterCountryStrip countries={cluster.countries} maxDots={10} />
          {countriesText ? (
            <p className="text-[11px] leading-snug text-muted-foreground">{countriesText}</p>
          ) : null}
        </div>

        <p className="mt-auto pt-4 text-[11px] font-medium text-foreground underline decoration-border underline-offset-[3px] group-hover:decoration-foreground">
          Ouvrir le sujet →
        </p>
      </article>
    </Link>
  );
}
