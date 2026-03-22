"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { displayClusterTitle } from "@/lib/cluster-display";
import type { ThesisPreviewItem, TopicCluster } from "@/lib/types";
import { ClusterCountryStrip } from "./cluster-country-strip";

const MAX_COUNTRIES_TEXT = 8;
const MAX_SECOND_VOICE = 200;

const ARTICLE_TYPE_FR: Record<string, string> = {
  opinion: "Opinion",
  editorial: "Éditorial",
  tribune: "Tribune",
  analysis: "Analyse",
  news: "Actualité",
  interview: "Entretien",
  reportage: "Reportage",
};

const LANG_FR: Record<string, string> = {
  ar: "Arabe",
  en: "Anglais",
  fr: "Français",
  he: "Hébreu",
  fa: "Persan",
  tr: "Turc",
  ku: "Kurde",
};

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
      source_language: null,
    };
  }
  return {
    thesis: raw.thesis,
    media_name: raw.media_name ?? null,
    article_type: raw.article_type ?? null,
    author: raw.author ?? null,
    country: raw.country ?? null,
    source_language: raw.source_language ?? null,
  };
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

function typeLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return ARTICLE_TYPE_FR[code.trim().toLowerCase()] ?? code;
}

function langLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return LANG_FR[code.trim().toLowerCase()] ?? code.toUpperCase();
}

/** Source : auteur, média, pays, format, langue d’origine. */
function PreviewAttribution({ p }: { p: ThesisPreviewItem & { thesis: string } }) {
  const bits: string[] = [];
  if (p.author?.trim()) bits.push(p.author.trim());
  if (p.media_name?.trim()) bits.push(p.media_name.trim());
  if (p.country?.trim()) bits.push(p.country.trim());
  const t = typeLabel(p.article_type ?? undefined);
  if (t) bits.push(t);
  const l = langLabel(p.source_language ?? undefined);
  if (l) bits.push(l);
  if (bits.length === 0) return null;
  return (
    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{bits.join(" · ")}</p>
  );
}

function SectionTitle({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <h3
      id={id}
      className="mb-1 font-[family-name:var(--font-serif)] text-[13px] font-semibold text-foreground"
    >
      {children}
    </h3>
  );
}

function SectionHint({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">{children}</p>
  );
}

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  const queryClient = useQueryClient();
  const href = `/clusters/${cluster.id}`;

  const rawPreviews = cluster.thesis_previews ?? [];
  const first = rawPreviews[0] ? normalizePreview(rawPreviews[0]) : null;
  const second = rawPreviews[1] ? normalizePreview(rawPreviews[1]) : null;

  const secondExcerpt =
    second && second.thesis.trim().length > 0
      ? second.thesis.length > MAX_SECOND_VOICE
        ? `${second.thesis.slice(0, MAX_SECOND_VOICE).trim()}…`
        : second.thesis
      : null;

  const freshness = formatFreshness(cluster.latest_article_at);
  const countriesText = countriesShortLine(cluster.countries);
  const pertinencePct =
    cluster.avg_relevance > 0 ? Math.round(cluster.avg_relevance * 100) : null;

  const statsSentence = (
    <>
      <span className="text-muted-foreground">Articles</span>{" "}
      <span className="font-medium tabular-nums text-foreground">{cluster.article_count}</span>
      <span className="mx-1.5 text-border" aria-hidden>
        ·
      </span>
      <span className="text-muted-foreground">Pays</span>{" "}
      <span className="font-medium tabular-nums text-foreground">{cluster.country_count}</span>
      <span className="mx-1.5 text-border" aria-hidden>
        ·
      </span>
      <span className="text-muted-foreground">Pertinence</span>{" "}
      <span className="font-medium tabular-nums text-foreground">
        {pertinencePct !== null ? `${pertinencePct} %` : "non renseigné"}
      </span>
      <span className="mx-1.5 text-border" aria-hidden>
        ·
      </span>
      <span className="text-muted-foreground">Mise à jour</span>{" "}
      <span className="font-medium text-foreground">{freshness ?? "non renseigné"}</span>
    </>
  );

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
      <article className="flex h-full flex-col border border-border-light bg-card/40 p-5 transition-colors hover:bg-muted/35 sm:p-6">
        {cluster.is_emerging ? (
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            Nouveau sujet
          </p>
        ) : null}

        <header className="border-b border-border-light pb-4">
          <h2 className="font-[family-name:var(--font-serif)] text-[1.2rem] font-semibold leading-[1.35] text-foreground sm:text-[1.28rem]">
            {displayClusterTitle(cluster.label)}
          </h2>
        </header>

        <p className="mt-4 text-[12px] leading-relaxed text-foreground-body">{statsSentence}</p>

        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-6">
          {first?.thesis ? (
            <section aria-labelledby={`cluster-${cluster.id}-lead`}>
              <SectionTitle id={`cluster-${cluster.id}-lead`}>Extrait principal</SectionTitle>
              <SectionHint>
                Thèse tirée de l’article le plus récent parmi ceux regroupés ici (date de parution).
              </SectionHint>
              <p
                className="text-[14px] leading-relaxed text-foreground-body line-clamp-4"
                title={first.thesis}
              >
                {first.thesis}
              </p>
              <PreviewAttribution p={first} />
            </section>
          ) : (
            <section>
              <SectionTitle>Extrait principal</SectionTitle>
              <p className="text-[13px] italic text-muted-foreground">
                Aucune thèse disponible en aperçu. Ouvrez le sujet pour lire les articles.
              </p>
            </section>
          )}

          {secondExcerpt ? (
            <section
              className="border-l-2 border-accent/25 pl-4"
              aria-labelledby={`cluster-${cluster.id}-second`}
            >
              <SectionTitle id={`cluster-${cluster.id}-second`}>Second extrait</SectionTitle>
              <SectionHint>
                Autre article du même sujet : autre média ou autre formulation de la thèse.
              </SectionHint>
              <p className="font-[family-name:var(--font-serif)] text-[13px] italic leading-relaxed text-foreground-subtle">
                «&nbsp;{secondExcerpt}&nbsp;»
              </p>
              {second ? <PreviewAttribution p={second} /> : null}
            </section>
          ) : null}
        </div>

        <footer className="mt-6 space-y-3 border-t border-border-light pt-4">
          <div>
            <ClusterCountryStrip countries={cluster.countries} maxDots={12} />
            {countriesText ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                {countriesText}
              </p>
            ) : null}
          </div>
          <p className="text-[11px] font-medium text-foreground underline decoration-border underline-offset-[3px] group-hover:decoration-foreground">
            Ouvrir le sujet →
          </p>
        </footer>
      </article>
    </Link>
  );
}
