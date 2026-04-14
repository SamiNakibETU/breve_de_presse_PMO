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
          "flex h-full flex-col rounded-xl border border-border bg-card p-5",
          "transition-all [transition-duration:var(--duration-normal)] [transition-timing-function:var(--ease-out-expo)]",
          "group-hover:border-accent/35 group-hover:shadow-mid group-hover:-translate-y-px",
          "sm:p-6",
        ].join(" ")}
      >
        {/* Méta en haut : badge + stats */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {cluster.is_emerging ? (
            <span className="inline-flex rounded bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-accent-foreground">
              Nouveau
            </span>
          ) : null}
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {cluster.article_count} article{cluster.article_count !== 1 ? "s" : ""}
            {" · "}
            {cluster.country_count} pays
          </span>
          {freshness && (
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              · {freshness}
            </span>
          )}
        </div>

        {/* TITRE */}
        <h2 className="font-[family-name:var(--font-serif)] text-[18px] font-semibold leading-snug tracking-tight text-foreground group-hover:text-accent transition-colors [transition-duration:var(--duration-fast)] sm:text-[19px]">
          {displayClusterTitle(cluster.label)}
        </h2>

        {/* VOIX ÉDITORIALES */}
        <div className="mt-3.5 flex min-h-0 flex-1 flex-col space-y-3">
          {first?.thesis.trim() ? (
            <div className="rounded-lg bg-surface-warm/30 px-3.5 py-2.5">
              <p
                className="font-[family-name:var(--font-serif)] text-[13px] leading-relaxed text-foreground-body line-clamp-4 italic"
                title={first.thesis}
              >
                {first.thesis}
              </p>
              <Attribution p={first} />
            </div>
          ) : null}

          {second?.thesis.trim() ? (
            <div className="px-1">
              <p
                className="font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-subtle line-clamp-3"
                title={second.thesis}
              >
                «&nbsp;{truncate(second.thesis, MAX_SECOND_VOICE)}&nbsp;»
              </p>
              <Attribution p={second} />
            </div>
          ) : null}

          {third?.thesis.trim() ? (
            <div className="px-1">
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
            <p className="text-[12px] italic text-muted-foreground">
              Ouvrez le dossier pour lire les articles.
            </p>
          ) : null}
        </div>

        {/* PIED : drapeaux + pays tags + lien */}
        <footer className="mt-4 border-t border-border-light pt-3.5">
          {freshness ? (
            <p className="mb-2.5 text-[10px] tabular-nums text-muted-foreground">
              Parution la plus récente (Beyrouth) :{" "}
              <span className="font-medium text-foreground-body">{freshness}</span>
            </p>
          ) : null}
          {flags.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1" aria-label="Pays couverts">
              {flags.map(({ emoji, name }) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/15 px-1.5 py-0.5 text-[11px] transition-colors hover:border-foreground/25 hover:bg-muted/45"
                  title={name}
                >
                  <span className="text-[13px] leading-none">{emoji}</span>
                  <span className="text-[9px] font-medium uppercase tracking-wide text-foreground-body">{name.length <= 12 ? name : name.slice(0, 2).toUpperCase()}</span>
                </span>
              ))}
              {cluster.countries.length > 8 && (
                <span className="text-[10px] text-muted-foreground">
                  +{cluster.countries.length - 8}
                </span>
              )}
            </div>
          )}

          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-low transition-all [transition-duration:var(--duration-fast)] group-hover:border-accent/40 group-hover:bg-accent-tint/90 group-hover:text-accent">
            Ouvrir le dossier
            <span aria-hidden className="text-accent">
              →
            </span>
          </span>
        </footer>
      </article>
    </Link>
  );
}
