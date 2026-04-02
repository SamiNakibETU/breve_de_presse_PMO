"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import {
  articleTypeLabelFr,
  sourceLanguageLabelFr,
} from "@/lib/article-labels-fr";
import {
  formatAuthorDisplay,
  relevanceBandLabelFr,
} from "@/lib/article-relevance-display";
import { articleDetailQueryKey } from "@/contexts/article-reader";
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import { editorialBodySections } from "@/lib/editorial-body";
import {
  decodeHtmlEntities,
  formatQuoteForDisplay,
} from "@/lib/text-utils";

const STALE_MS = 60_000;

function buildSynthesisPlainText(a: Article): string {
  const parts: string[] = [];
  if (a.thesis_summary_fr?.trim()) {
    parts.push(`Thèse : ${a.thesis_summary_fr.trim()}`);
  }
  if (a.summary_fr?.trim()) {
    parts.push(`Résumé : ${a.summary_fr.trim()}`);
  }
  if (a.key_quotes_fr?.length) {
    parts.push(
      "Citations :\n" +
        a.key_quotes_fr
          .map((q) => `« ${formatQuoteForDisplay(q)} »`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

function bodyParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function oljThemesLine(
  ids: string[] | null | undefined,
  labelsFr: Record<string, string> | null,
): string | null {
  if (!ids?.length) return null;
  const parts = ids
    .map((id) => labelsFr?.[id.trim()]?.trim() || id.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export default function ArticleFullPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [copied, setCopied] = useState(false);

  const labelsQ = useQuery({
    queryKey: ["oljTopicLabels"] as const,
    queryFn: () => api.oljTopicLabels(),
    staleTime: 60 * 60 * 1000,
  });

  const q = useQuery({
    queryKey: articleDetailQueryKey(id),
    queryFn: () => api.articleById(id),
    enabled: Boolean(id),
    staleTime: STALE_MS,
  });

  const copySynth = useCallback(async () => {
    const a = q.data;
    if (!a) return;
    try {
      await navigator.clipboard.writeText(buildSynthesisPlainText(a));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [q.data]);

  const a = q.data;
  const title = a
    ? decodeHtmlEntities(
        (a.title_fr?.trim() || a.title_original || "Article").trim(),
      )
    : "Article";
  const titleOriginalDisplay = a
    ? decodeHtmlEntities(a.title_original || "")
    : "";
  const typeFr = articleTypeLabelFr(a?.article_type);
  const langFr = sourceLanguageLabelFr(a?.source_language);
  const cc = (a?.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const authorLine = a ? formatAuthorDisplay(a.author) : null;
  const relevanceLbl =
    a != null
      ? relevanceBandLabelFr(a.relevance_band, a.editorial_relevance)
      : null;
  const hasBodyFr = Boolean(a?.content_translated_fr?.trim());
  const summaryOnly = Boolean(a?.en_translation_summary_only) && !hasBodyFr;
  const themesStr = a
    ? oljThemesLine(a.olj_topic_ids, labelsQ.data?.labels_fr ?? null)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-20">
      <nav>
        <Link
          href="/articles"
          className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Retour aux articles
        </Link>
      </nav>

      {q.isPending ? (
        <p className="text-[13px] text-muted-foreground" role="status">
          Chargement…
        </p>
      ) : q.isError ? (
        <p className="text-[13px] text-destructive" role="alert">
          {q.error instanceof Error
            ? q.error.message
            : "Article introuvable."}
        </p>
      ) : a ? (
        <article className="space-y-8">
          <header className="space-y-3 border-b border-border pb-6">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              {flag ? (
                <span className="text-[1.25rem] leading-none" aria-hidden>
                  {flag}
                </span>
              ) : null}
              <span>{a.country?.trim() || cc}</span>
              <span>·</span>
              <span className="font-semibold text-foreground">{a.media_name}</span>
              {typeFr ? (
                <>
                  <span>·</span>
                  <span className="rounded-sm bg-muted/50 px-2 py-0.5 text-[12px] font-medium text-foreground">
                    {typeFr}
                  </span>
                </>
              ) : null}
            </p>
            <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight text-foreground">
              {title}
            </h1>
            {a.title_original && a.title_fr && a.title_fr !== a.title_original ? (
              <p className="text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground-body">
                  Titre original :{" "}
                </span>
                {titleOriginalDisplay}
              </p>
            ) : null}
            <p className="flex flex-wrap gap-x-2 text-[13px] text-foreground-body">
              {authorLine ? <span>{authorLine}</span> : null}
              {a.published_at ? (
                <time dateTime={a.published_at} className="tabular-nums">
                  {authorLine ? "· " : null}
                  {new Date(a.published_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              ) : null}
              {langFr ? (
                <span>
                  {(authorLine || a.published_at) ? " · " : null}
                  {langFr}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="olj-btn-secondary px-3 py-1.5 text-[12px] disabled:opacity-40"
                disabled={!buildSynthesisPlainText(a).trim()}
                onClick={() => void copySynth()}
              >
                {copied ? "Copié" : "Copier la synthèse"}
              </button>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="olj-btn-secondary inline-flex px-3 py-1.5 text-[12px]"
                >
                  Source originale ↗
                </a>
              ) : null}
            </div>
          </header>

          {(a.analysis_bullets_fr?.length ||
            a.author_thesis_explicit_fr?.trim() ||
            a.factual_context_fr?.trim()) ? (
            <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
              <h2 className="olj-rubric mb-4">Analyse</h2>
              <div className="space-y-4 text-[15px] leading-relaxed text-foreground-body">
                {a.factual_context_fr?.trim() ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Contexte factuel
                    </p>
                    <p>{a.factual_context_fr.trim()}</p>
                  </div>
                ) : null}
                {a.author_thesis_explicit_fr?.trim() ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Thèse (attribution)
                    </p>
                    <p className="italic text-foreground">
                      {a.author_thesis_explicit_fr.trim()}
                    </p>
                  </div>
                ) : null}
                {a.analysis_bullets_fr && a.analysis_bullets_fr.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Idées majeures
                    </p>
                    <ol className="list-none space-y-3 text-[13px] text-foreground-body">
                      {a.analysis_bullets_fr.map((b, i) => (
                        <li key={i} className="flex gap-2 whitespace-pre-wrap">
                          <span
                            className="mt-0.5 text-[11px] font-semibold tabular-nums text-accent"
                            aria-hidden
                          >
                            {i + 1}.
                          </span>
                          <span
                            className="mt-0.5 shrink-0 text-[0.75rem] leading-none"
                            aria-hidden
                          >
                            {/^(fait|contexte|chronologie)/i.test(b.trim())
                              ? "◆"
                              : /(opinion|thèse|avis|position)/i.test(b.trim())
                                ? "◇"
                                : "•"}
                          </span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {a.analysis_tone || a.fact_opinion_quality ? (
                  <p className="text-[12px] text-muted-foreground">
                    {a.analysis_tone ? `Tonalité : ${a.analysis_tone}. ` : null}
                    {a.fact_opinion_quality
                      ? `Séparation fait / opinion : ${a.fact_opinion_quality}.`
                      : null}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <h2 className="olj-rubric mb-4">Synthèse</h2>
            <div className="space-y-4 font-[family-name:var(--font-serif)] text-[15px] leading-[1.75] text-foreground-body">
              {a.thesis_summary_fr?.trim() ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Thèse
                  </p>
                  <p className="italic text-foreground">{a.thesis_summary_fr.trim()}</p>
                </div>
              ) : null}
              {a.summary_fr?.trim() ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Résumé
                  </p>
                  <div className="space-y-3">
                    {bodyParagraphs(a.summary_fr.trim()).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {a.key_quotes_fr && a.key_quotes_fr.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Citations clés
                  </p>
                  <ul className="space-y-2 border-l-2 border-accent/20 pl-4">
                    {a.key_quotes_fr.map((quote, i) => (
                      <li key={i} className="italic">
                        «&nbsp;{formatQuoteForDisplay(quote)}&nbsp;»
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!a.thesis_summary_fr?.trim() &&
              !a.summary_fr?.trim() &&
              !(a.key_quotes_fr && a.key_quotes_fr.length) ? (
                <p className="text-muted-foreground">
                  Aucune synthèse disponible pour cet article.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <h2 className="olj-rubric mb-2">Traduction intégrale</h2>
            {hasBodyFr ? (
              <>
                <p className="mb-4 text-[12px] text-muted-foreground">
                  Corps traduit tel qu’enregistré après la chaîne de traitement.
                </p>
                <div className="font-[family-name:var(--font-serif)] text-[16px] leading-[1.85] text-foreground-body">
                  {editorialBodySections(a.content_translated_fr!.trim()).map(
                    (sec, si) => (
                      <div
                        key={si}
                        className={
                          si > 0
                            ? "mt-8 border-t border-border-light pt-8"
                            : ""
                        }
                      >
                        {sec.heading ? (
                          <p className="mb-4 font-semibold text-foreground">
                            {sec.heading}
                          </p>
                        ) : null}
                        {sec.paragraphs.map((para, i) => (
                          <p
                            key={i}
                            className={
                              i === 0 && si === 0
                                ? "mb-5 last:mb-0 [&:first-letter]:float-left [&:first-letter]:mr-2 [&:first-letter]:font-[family-name:var(--font-serif)] [&:first-letter]:text-[3.25rem] [&:first-letter]:leading-[0.85] [&:first-letter]:text-accent"
                                : "mb-5 last:mb-0"
                            }
                          >
                            {para}
                          </p>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              </>
            ) : summaryOnly ? (
              <div className="space-y-3 text-[13px] leading-relaxed text-foreground-body">
                <p className="text-muted-foreground">
                  Pour cet article, seul un <strong className="font-medium text-foreground">résumé</strong>{" "}
                  a été conservé en base (pas le corps complet). La section <strong className="font-medium text-foreground">Synthèse</strong>{" "}
                  ci-dessus concentre l’essentiel pour la revue ; ouvrez la{" "}
                  <strong className="font-medium text-foreground">source</strong> pour le texte original.
                </p>
              </div>
            ) : a.summary_fr?.trim() ? (
              <div className="space-y-3 text-[13px] leading-relaxed text-foreground-body">
                <p className="text-muted-foreground">
                  Le <strong className="font-medium text-foreground">corps intégral traduit</strong> n’est pas stocké
                  pour cet article. Le contenu exploitable en rédaction est la{" "}
                  <strong className="font-medium text-foreground">synthèse</strong> (thèse, résumé, citations) dans
                  la section du dessus — équivalent « lecture longue » pour la revue de presse.
                </p>
                {a.url ? (
                  <p>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent underline underline-offset-2"
                    >
                      Ouvrir l’article sur le site source
                    </a>{" "}
                    <span className="text-muted-foreground">
                      ({langFr ?? "langue d’origine"}) pour la version complète.
                    </span>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Aucun corps traduit ni résumé structuré : consultez la source si l’URL est disponible.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-muted/10 p-5 sm:p-6 text-[13px] leading-relaxed text-foreground-body">
            <h2 className="olj-rubric mb-4">Informations</h2>
            <ul className="space-y-2">
              {relevanceLbl ? (
                <li>
                  <span className="text-muted-foreground">Pertinence : </span>
                  {relevanceLbl}
                </li>
              ) : null}
              {themesStr ? (
                <li>
                  <span className="text-muted-foreground">Thèmes OLJ : </span>
                  {themesStr}
                </li>
              ) : null}
              {a.editorial_angle?.trim() ? (
                <li>
                  <span className="text-muted-foreground">Angle éditorial : </span>
                  {a.editorial_angle.trim()}
                </li>
              ) : null}
              {(a.framing_actor || a.framing_tone || a.framing_prescription) && (
                <li className="space-y-1">
                  <span className="text-muted-foreground">Cadrage : </span>
                  {a.framing_actor ? <span>{a.framing_actor}</span> : null}
                  {a.framing_tone ? (
                    <span>
                      {a.framing_actor ? " · " : null}
                      {a.framing_tone}
                    </span>
                  ) : null}
                  {a.framing_prescription ? (
                    <span>
                      {(a.framing_actor || a.framing_tone) ? " · " : null}
                      {a.framing_prescription}
                    </span>
                  ) : null}
                </li>
              )}
              {a.url ? (
                <li>
                  <span className="text-muted-foreground">Source : </span>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    lien
                  </a>
                </li>
              ) : null}
              <li>
                <span className="text-muted-foreground">Collecté le : </span>
                <time dateTime={a.collected_at} className="tabular-nums">
                  {new Date(a.collected_at).toLocaleString("fr-FR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </li>
            </ul>
          </section>
        </article>
      ) : null}
    </div>
  );
}
