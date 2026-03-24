"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Edition, EditionTopic } from "@/lib/types";
import { CopyExportButtons } from "@/components/composition/CopyExportButtons";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { TopicGeneratedProse } from "@/components/composition/TopicGeneratedProse";

function topicPlainText(t: EditionTopic): string {
  const title = t.title_final ?? t.title_proposed;
  const body = t.generated_text?.trim();
  if (body) {
    return `« ${title} »\n\n${body}`;
  }
  return `« ${title} »\n\n(Texte non encore généré — sélectionnez des articles et cliquez sur Générer.)`;
}

function editionTitleLine(date: string): string {
  try {
    const d = new Date(`${date}T12:00:00`);
    const fr = d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return fr.charAt(0).toUpperCase() + fr.slice(1);
  } catch {
    return date;
  }
}

export default function ComposePage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";
  const qc = useQueryClient();
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedTopicId, setCopiedTopicId] = useState<string | null>(null);
  const [regeneratingTopicId, setRegeneratingTopicId] = useState<string | null>(
    null,
  );

  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
  });

  const editionId = editionQ.data?.id;

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "compose"] as const,
    queryFn: () =>
      api.editionTopics(editionId!, {
        includeArticlePreviews: true,
        maxArticlePreviewsPerTopic: 200,
      }),
    enabled: Boolean(editionId),
  });

  const selectionsQ = useQuery({
    queryKey: ["editionSelections", editionId] as const,
    queryFn: () => api.editionSelections(editionId!),
    enabled: Boolean(editionId),
  });

  const coverageQ = useQuery({
    queryKey: ["coverageTargets"] as const,
    queryFn: () => api.coverageTargets(),
  });

  const genAllMutation = useMutation({
    mutationFn: () => api.editionGenerateAll(editionId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edition", date] });
      qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
    },
  });

  const genTopicMutation = useMutation({
    mutationFn: (topicId: string) =>
      api.editionTopicGenerate(editionId!, topicId, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
      qc.invalidateQueries({ queryKey: ["edition", date] });
    },
    onSettled: () => setRegeneratingTopicId(null),
  });

  const topics = useMemo(() => topicsQ.data ?? [], [topicsQ.data]);

  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const ids of Object.values(selectionsQ.data?.topics ?? {})) {
      for (const id of ids) s.add(id);
    }
    return s;
  }, [selectionsQ.data]);

  const selectedCountryCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const t of topics) {
      for (const p of t.article_previews ?? []) {
        if (selectedIds.has(p.id) && p.country_code?.trim()) {
          codes.add(p.country_code.trim().toUpperCase());
        }
      }
    }
    return [...codes];
  }, [topics, selectedIds]);

  const assembledPlain = useMemo(
    () => topics.map((t) => topicPlainText(t)).join("\n\n\n\n"),
    [topics],
  );

  const copyTopic = useCallback(async (t: EditionTopic) => {
    try {
      await navigator.clipboard.writeText(topicPlainText(t));
      setCopiedTopicId(t.id);
      window.setTimeout(() => setCopiedTopicId(null), 2000);
    } catch {
      setCopiedTopicId(null);
    }
  }, []);

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(assembledPlain);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setCopiedAll(false);
    }
  }, [assembledPlain]);

  const titleFr = editionTitleLine(date);

  return (
    <div className="space-y-10 pb-16">
      <nav className="text-[13px] text-muted-foreground">
        <Link
          href={`/edition/${date}`}
          className="underline-offset-4 hover:underline"
        >
          ← Retour à l’édition
        </Link>
      </nav>

      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold">
          Rédaction · {titleFr}
        </h1>
        <p className="max-w-2xl text-[13px] text-foreground-body">
          Assemblage des textes générés pour chaque sujet. Copiez bloc par bloc ou l’ensemble pour publication.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="border border-foreground bg-foreground px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          disabled={!editionId || genAllMutation.isPending || topics.length === 0}
          onClick={() => genAllMutation.mutate()}
        >
          {genAllMutation.isPending
            ? "Génération en cours…"
            : "Générer tous les textes"}
        </button>
        <button
          type="button"
          className="olj-btn-secondary px-4 py-2 text-[13px] disabled:opacity-50"
          disabled={topics.length === 0}
          onClick={() => void copyAll()}
        >
          {copiedAll ? "Copié" : "Copier toute la revue"}
        </button>
        {genAllMutation.isError && (
          <span className="text-[12px] text-accent" role="alert" aria-live="polite">
            {(genAllMutation.error as Error)?.message ?? "Échec"}
          </span>
        )}
        {genAllMutation.isSuccess && genAllMutation.data?.status === "partial" && (
          <span className="text-[12px] text-warning">
            Partiel : certains sujets ont échoué.
          </span>
        )}
      </div>

      <CoverageGaps
        selectedCountryCodes={selectedCountryCodes}
        targets={coverageQ.data ?? null}
      />

      <section className="space-y-12">
        {topics.map((t, idx) => {
          const title = t.title_final ?? t.title_proposed;
          const previews = t.article_previews ?? [];
          const codes = new Set(
            previews
              .map((p) => (p.country_code ?? "").trim().toUpperCase())
              .filter(Boolean),
          );
          const nTexts = t.article_count ?? previews.length;
          const nCountries = codes.size;
          const hasGen = Boolean(t.generated_text?.trim());

          return (
            <article
              key={t.id}
              className="border-t border-border-light pt-10 first:border-t-0 first:pt-0"
            >
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sujet {idx + 1}
                  </p>
                  <h2 className="mt-1 font-[family-name:var(--font-serif)] text-[19px] font-semibold leading-snug text-foreground">
                    {title}
                  </h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {nTexts} texte{nTexts > 1 ? "s" : ""}
                    {nCountries > 0
                      ? ` · ${nCountries} pays`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="olj-btn-secondary px-3 py-1.5 text-[12px]"
                    onClick={() => void copyTopic(t)}
                  >
                    {copiedTopicId === t.id ? "Copié" : "Copier ce sujet"}
                  </button>
                  <button
                    type="button"
                    className="olj-btn-secondary px-3 py-1.5 text-[12px] disabled:opacity-50"
                    disabled={!editionId || genTopicMutation.isPending}
                    onClick={() => {
                      setRegeneratingTopicId(t.id);
                      genTopicMutation.mutate(t.id);
                    }}
                  >
                    {genTopicMutation.isPending && regeneratingTopicId === t.id
                      ? "Régénération…"
                      : "Régénérer"}
                  </button>
                </div>
              </div>

              {hasGen ? (
                <TopicGeneratedProse
                  text={t.generated_text!}
                  variant="compose"
                />
              ) : (
                <p className="mt-2 rounded-md border border-dashed border-border bg-muted/10 p-4 font-[family-name:var(--font-serif)] text-[15px] leading-relaxed text-muted-foreground">
                  Texte non encore généré — sélectionnez des articles sur l’édition ou la fiche sujet, puis utilisez « Générer tous les textes » ou « Régénérer ».
                </p>
              )}
            </article>
          );
        })}
      </section>

      {topics.length === 0 && !topicsQ.isPending ? (
        <p className="text-[13px] text-muted-foreground">
          Aucun sujet pour cette édition. Identifiez les sujets depuis le sommaire de l’édition.
        </p>
      ) : null}

      {genTopicMutation.isError ? (
        <p className="text-[12px] text-accent" role="alert">
          {(genTopicMutation.error as Error)?.message ?? "Échec de la régénération d’un sujet."}
        </p>
      ) : null}

      <footer className="space-y-4 border-t border-border-light pt-8">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="olj-btn-secondary px-4 py-2 text-[13px] disabled:opacity-50"
            disabled={topics.length === 0}
            onClick={() => void copyAll()}
          >
            {copiedAll ? "Copié" : "Copier toute la revue"}
          </button>
        </div>
        <CopyExportButtons text={assembledPlain} filename={`revue-${date}.txt`} />
      </footer>
    </div>
  );
}
