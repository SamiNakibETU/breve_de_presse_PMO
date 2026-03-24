"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { displayClusterTitle } from "@/lib/cluster-display";
import type { ThesisPreviewItem, TopicCluster } from "@/lib/types";
import { ClusterCountryStrip } from "./cluster-country-strip";

const MAX_COUNTRIES_TEXT = 8;
const MAX_SECOND_VOICE = 200;
const MAX_THIRD_VOICE = 180;

const VOICE_HINTS: readonly [string, string, string] = [
  "Voix la plus récente dans ce dossier",
  "Autre média ou autre formulation",
  "Troisième angle sur le même thème",
];

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

function truncateThesis(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trim()}…`;
}

function VoiceSnippetRow({
  clusterId,
  voiceIndex,
  preview,
  mode,
}: {
  clusterId: string;
  voiceIndex: 1 | 2 | 3;
  preview: ThesisPreviewItem & { thesis: string };
  mode: "lead" | "quote";
}) {
  const hint = VOICE_HINTS[voiceIndex - 1];
  const body =
    mode === "lead"
      ? preview.thesis
      : truncateThesis(
          preview.thesis,
          voiceIndex === 2 ? MAX_SECOND_VOICE : MAX_THIRD_VOICE,
        );

  return (
    <div
      className="grid grid-cols-1 gap-2 border-b border-border/80 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)] sm:items-start sm:gap-3 sm:px-3.5"
      role="group"
      aria-labelledby={`cluster-${clusterId}-v${voiceIndex}-lbl`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          id={`cluster-${clusterId}-v${voiceIndex}-lbl`}
          className="inline-flex w-fit rounded-full border border-accent/40 bg-accent/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent"
        >
          Voix {voiceIndex}
        </span>
        <span className="text-[10px] leading-snug text-muted-foreground">{hint}</span>
      </div>
      <div className="min-w-0">
        {mode === "lead" ? (
          <p
            className="text-[14px] leading-relaxed text-foreground-body line-clamp-4"
            title={preview.thesis}
          >
            {body}
          </p>
        ) : (
          <p
            className="font-[family-name:var(--font-serif)] text-[13px] italic leading-relaxed text-foreground-subtle"
            title={preview.thesis}
          >
            «&nbsp;{body}&nbsp;»
          </p>
        )}
        <PreviewAttribution p={preview} />
      </div>
    </div>
  );
}

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  const queryClient = useQueryClient();
  const href = `/clusters/${cluster.id}`;

  const rawPreviews = cluster.thesis_previews ?? [];
  const first = rawPreviews[0] ? normalizePreview(rawPreviews[0]) : null;
  const second = rawPreviews[1] ? normalizePreview(rawPreviews[1]) : null;
  const third = rawPreviews[2] ? normalizePreview(rawPreviews[2]) : null;

  const voiceRows: { idx: 1 | 2 | 3; p: ThesisPreviewItem & { thesis: string }; mode: "lead" | "quote" }[] =
    [];
  if (first?.thesis.trim()) {
    voiceRows.push({ idx: 1, p: first, mode: "lead" });
  }
  if (second?.thesis.trim()) {
    voiceRows.push({ idx: 2, p: second, mode: "quote" });
  }
  if (third?.thesis.trim()) {
    voiceRows.push({ idx: 3, p: third, mode: "quote" });
  }

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
      <article className="flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-info/40 hover:shadow-md sm:p-6">
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

        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          {voiceRows.length > 0 ? (
            <section
              className="overflow-hidden rounded-lg border border-border bg-surface-warm/25"
              aria-label="Trois voix maximum : aperçus des thèses"
            >
              {voiceRows.map(({ idx, p, mode }) => (
                <VoiceSnippetRow
                  key={idx}
                  clusterId={cluster.id}
                  voiceIndex={idx}
                  preview={p}
                  mode={mode}
                />
              ))}
            </section>
          ) : (
            <section className="rounded-lg border border-border border-dashed bg-muted/20 px-3 py-4">
              <p className="text-[13px] italic text-muted-foreground">
                Aucun aperçu de thèse pour ce dossier. Ouvrez-le pour lire les articles complets.
              </p>
            </section>
          )}
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
            Ouvrir le dossier →
          </p>
        </footer>
      </article>
    </Link>
  );
}
