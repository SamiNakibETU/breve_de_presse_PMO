"use client";

/**
 * ClusterCard — Carte dossier thématique, style magazine éditorial.
 *
 * Structure (Ryo Lu / Dieter Rams) :
 *   ┌─────────────────────────────────────────────────────┐
 *   │  NOUVEAU SUJET (badge si is_emerging)               │
 *   │                                                     │
 *   │  Tensions croissantes au Moyen-Orient               │ ← serif semibold
 *   │  12 articles · 5 pays · 78 %                        │ ← footnote muted
 *   │                                                     │
 *   │  "La diplomatie américaine se heurte à..."          │ ← italic serif body
 *   │                                         — Guardian  │ ← attribution
 *   │                                                     │
 *   │  "Face à cette pression, le Liban..."               │ ← italic serif caption
 *   │                                         — An-Nahar  │
 *   │                                                     │
 *   │  🇱🇧 🇺🇸 🇫🇷 🇮🇱 🇮🇷                               │ ← drapeaux seuls
 *   │                          Ouvrir le dossier →        │
 *   └─────────────────────────────────────────────────────┘
 */

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { countryLabelFr } from "@/lib/country-labels-fr";
import { displayClusterTitle } from "@/lib/cluster-display";
import { formatDateTimeBeirutFr } from "@/lib/dates-display-fr";
import type { ThesisPreviewItem, TopicCluster } from "@/lib/types";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";

const MAX_SECOND_VOICE = 300;
const MAX_THIRD_VOICE = 250;

function normalizePreview(
  raw: string | ThesisPreviewItem,
): ThesisPreviewItem & { thesis: string } {
  if (typeof raw === "string") {
    return {
      thesis: raw,
      media_name: null,
      article_type: null,
      author: null,
      country: null,
      country_code: null,
      source_language: null,
    };
  }
  return {
    thesis: raw.thesis,
    media_name: raw.media_name ?? null,
    article_type: raw.article_type ?? null,
    author: raw.author ?? null,
    country: raw.country ?? null,
    country_code: raw.country_code ?? null,
    source_language: raw.source_language ?? null,
  };
}

function formatFreshness(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return formatDateTimeBeirutFr(iso);
  } catch {
    return null;
  }
}

function truncate(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trim()}…`;
}

/** Attribution discrète : tiret cadratin + media */
function Attribution({
  p,
}: {
  p: ThesisPreviewItem & { thesis: string };
}) {
  const bits: string[] = [];
  if (p.author?.trim()) bits.push(p.author.trim());
  if (p.media_name?.trim()) bits.push(p.media_name.trim());
  if (p.country?.trim()) bits.push(p.country.trim());
  if (bits.length === 0) return null;
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      — {bits.join(", ")}
    </p>
  );
}

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  const queryClient = useQueryClient();
  const href = `/clusters/${cluster.id}`;

  const rawPreviews = cluster.thesis_previews ?? [];
  const first = rawPreviews[0] ? normalizePreview(rawPreviews[0]) : null;
  const second = rawPreviews[1] ? normalizePreview(rawPreviews[1]) : null;
  const third = rawPreviews[2] ? normalizePreview(rawPreviews[2]) : null;

  const pertinencePct =
    cluster.avg_relevance > 0 ? Math.round(cluster.avg_relevance * 100) : null;
  const freshness = formatFreshness(cluster.latest_article_at);

  /* Drapeaux pays : emoji seuls, tooltip pays complet */
  const flags = cluster.countries
    .slice(0, 8)
    .map((code) => {
      const upper = code.toUpperCase();
      const emoji = REGION_FLAG_EMOJI[upper];
      const name = countryLabelFr(upper);
      return emoji ? { emoji, name } : null;
    })
    .filter(Boolean) as { emoji: string; name: string }[];

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
      <article
        className={[
          "flex h-full flex-col rounded-lg border bg-card p-5",
          "transition-all [transition-duration:var(--duration-normal)] [transition-timing-function:var(--ease-out-expo)]",
          "hover:border-accent/20 hover:shadow-mid hover:-translate-y-px",
          "sm:p-6",
        ].join(" ")}
      >
        {/* Badge "Nouveau sujet" */}
        {cluster.is_emerging ? (
          <span className="mb-3 inline-flex w-fit rounded-sm bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-foreground">
            Nouveau sujet
          </span>
        ) : null}

        {/* TITRE */}
        <h2 className="font-[family-name:var(--font-serif)] text-[18px] font-semibold leading-snug tracking-tight text-foreground sm:text-[19px]">
          {displayClusterTitle(cluster.label)}
        </h2>

        {/* STATS inline */}
        <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
          {cluster.article_count} article{cluster.article_count !== 1 ? "s" : ""}
          {" · "}
          {cluster.country_count} pays
          {freshness && ` · ${freshness}`}
        </p>

        {/* VOIX ÉDITORIALES */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col space-y-4">
          {/* Voix 1 : corps plein, en body */}
          {first?.thesis.trim() ? (
            <div>
              <p
                className="font-[family-name:var(--font-serif)] text-[14px] leading-relaxed text-foreground-body line-clamp-5 italic"
                title={first.thesis}
              >
                {first.thesis}
              </p>
              <Attribution p={first} />
            </div>
          ) : null}

          {/* Voix 2 : en citation plus petite */}
          {second?.thesis.trim() ? (
            <div>
              <p
                className="font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-subtle line-clamp-4"
                title={second.thesis}
              >
                «&nbsp;{truncate(second.thesis, MAX_SECOND_VOICE)}&nbsp;»
              </p>
              <Attribution p={second} />
            </div>
          ) : null}

          {/* Voix 3 : encore plus discrète */}
          {third?.thesis.trim() ? (
            <div>
              <p
                className="font-[family-name:var(--font-serif)] text-[11px] italic leading-relaxed text-muted-foreground line-clamp-2"
                title={third.thesis}
              >
                «&nbsp;{truncate(third.thesis, MAX_THIRD_VOICE)}&nbsp;»
              </p>
              <Attribution p={third} />
            </div>
          ) : null}

          {!first && !second && !third ? (
            <p className="text-[13px] italic text-muted-foreground">
              Ouvrez le dossier pour lire les articles.
            </p>
          ) : null}
        </div>

        {/* PIED : drapeaux + lien */}
        <footer className="mt-5 border-t border-border-light pt-4">
          {/* Drapeaux — emoji seuls avec tooltip */}
          {flags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Pays couverts">
              {flags.map(({ emoji, name }) => (
                <span
                  key={name}
                  className="text-[18px] leading-none"
                  title={name}
                  aria-label={name}
                >
                  {emoji}
                </span>
              ))}
              {cluster.countries.length > 8 && (
                <span className="text-[11px] text-muted-foreground self-center">
                  +{cluster.countries.length - 8}
                </span>
              )}
            </div>
          )}

          <p className="text-[12px] font-semibold text-foreground underline decoration-border underline-offset-[3px] group-hover:decoration-foreground group-hover:text-accent transition-colors [transition-duration:var(--duration-fast)]">
            Ouvrir le dossier →
          </p>
        </footer>
      </article>
    </Link>
  );
}
