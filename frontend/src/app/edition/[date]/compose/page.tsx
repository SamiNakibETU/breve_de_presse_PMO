"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Edition, EditionTopic, TopicArticlePreview } from "@/lib/types";
import { CopyExportButtons } from "@/components/composition/CopyExportButtons";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { TopicGeneratedProse } from "@/components/composition/TopicGeneratedProse";

function topicPlainText(t: EditionTopic): string {
  const title = t.title_final ?? t.title_proposed;
  const body = t.generated_text?.trim();
  if (body) {
    return `« ${title} »\n\n${body}`;
  }
  return `« ${title} »\n\n(Texte non encore généré — utilisez « Rédiger ce sujet ».)`;
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

function previewLine(p: TopicArticlePreview): string {
  const t = (p.title_fr || p.title_original || "").trim();
  const th = (p.thesis_summary_fr || "").trim();
  if (th) {
    return th.length > 220 ? `${th.slice(0, 220)}…` : th;
  }
  return t || "—";
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
  const [instructionsText, setInstructionsText] = useState("");
  const instrSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const v = editionQ.data?.compose_instructions_fr ?? "";
    setInstructionsText(v);
  }, [editionQ.data?.id, editionQ.data?.compose_instructions_fr]);

  const scheduleInstructionsSave = useCallback(
    (text: string) => {
      if (!editionId) {
        return;
      }
      if (instrSaveTimer.current) {
        clearTimeout(instrSaveTimer.current);
      }
      instrSaveTimer.current = setTimeout(() => {
        void api
          .editionComposePreferences(editionId, {
            compose_instructions_fr: text,
          })
          .then(() => {
            void qc.invalidateQueries({ queryKey: ["edition", date] });
          })
          .catch(() => {
            /* ignore */
          });
        instrSaveTimer.current = null;
      }, 600);
    },
    [editionId, date, qc],
  );

  const onInstructionsChange = useCallback(
    (v: string) => {
      setInstructionsText(v);
      scheduleInstructionsSave(v);
    },
    [scheduleInstructionsSave],
  );

  const flushInstructions = useCallback(async () => {
    if (!editionId) {
      return;
    }
    if (instrSaveTimer.current) {
      clearTimeout(instrSaveTimer.current);
      instrSaveTimer.current = null;
    }
    await api.editionComposePreferences(editionId, {
      compose_instructions_fr: instructionsText,
    });
    await qc.invalidateQueries({ queryKey: ["edition", date] });
  }, [editionId, instructionsText, date, qc]);

  const genAllMutation = useMutation({
    mutationFn: async () => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      await api.editionComposePreferences(editionId, {
        compose_instructions_fr: instructionsText,
      });
      return api.editionGenerateAll(editionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edition", date] });
      qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
    },
  });

  const genTopicMutation = useMutation({
    mutationFn: async ({ topicId }: { topicId: string }) => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      await api.editionComposePreferences(editionId, {
        compose_instructions_fr: instructionsText,
      });
      return api.editionTopicGenerate(editionId, topicId, null, null);
    },
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
      for (const id of ids) {
        s.add(id);
      }
    }
    for (const id of selectionsQ.data?.extra_article_ids ?? []) {
      s.add(id);
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
    for (const p of selectionsQ.data?.extra_articles ?? []) {
      if (selectedIds.has(p.id) && p.country_code?.trim()) {
        codes.add(p.country_code.trim().toUpperCase());
      }
    }
    return [...codes];
  }, [topics, selectedIds, selectionsQ.data?.extra_articles]);

  const selectionByTopic = useMemo(() => {
    const out: {
      topic: EditionTopic;
      picked: TopicArticlePreview[];
    }[] = [];
    for (const t of topics) {
      const prev = t.article_previews ?? [];
      const picked = prev.filter((p) => selectedIds.has(p.id));
      if (picked.length > 0) {
        out.push({ topic: t, picked });
      }
    }
    return out;
  }, [topics, selectedIds]);

  const extraOnlyPreviews = useMemo(
    () => selectionsQ.data?.extra_articles ?? [],
    [selectionsQ.data?.extra_articles],
  );

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
          ← Retour au sommaire de l’édition
        </Link>
      </nav>

      <header className="space-y-3">
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold">
          Rédaction · {titleFr}
        </h1>
        <ol className="max-w-2xl list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-foreground-body">
          <li>
            Vérifiez ci-dessous les <strong className="font-semibold text-foreground">articles cochés</strong> (sommaire + éventuels regroupements).
          </li>
          <li>
            Optionnel : consignes pour le modèle (ton, angles, exclusions).
          </li>
          <li>
            <strong className="font-semibold text-foreground">Rédiger</strong> génère les paragraphes revue OLJ <strong className="font-semibold text-foreground">par grand sujet</strong> (un bloc par sujet).
          </li>
        </ol>
      </header>

      <section
        aria-labelledby="compose-selection-heading"
        className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <h2
          id="compose-selection-heading"
          className="olj-rubric mb-3 border-b border-border-light pb-2"
        >
          Articles retenus ({selectedIds.size})
        </h2>
        {selectionsQ.isPending ? (
          <p className="text-[13px] text-muted-foreground">Chargement…</p>
        ) : selectedIds.size === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Aucune sélection : retournez au{" "}
            <Link href={`/edition/${date}`} className="olj-link-action">
              sommaire
            </Link>{" "}
            et cochez des articles sous les grands sujets (et sous les regroupements si besoin).
          </p>
        ) : (
          <div className="space-y-6">
            {selectionByTopic.map(({ topic, picked }) => (
              <div key={topic.id}>
                <p className="text-[12px] font-semibold text-foreground">
                  {topic.title_final ?? topic.title_proposed}
                </p>
                <ul className="mt-2 space-y-2 border-l-2 border-accent/25 pl-3">
                  {picked.map((p) => (
                    <li key={p.id} className="text-[12px] leading-relaxed">
                      <span className="font-medium text-foreground">
                        {p.media_name}
                      </span>
                      {p.country_code ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {p.country_code}
                        </span>
                      ) : null}
                      <br />
                      <span className="text-foreground-body">{previewLine(p)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {extraOnlyPreviews.length > 0 ? (
              <div>
                <p className="text-[12px] font-semibold text-foreground">
                  Complément (regroupements)
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Ces coches renforcent la <strong className="font-medium text-foreground">couverture</strong> affichée sur le sommaire. La génération de texte utilise les articles <strong className="font-medium text-foreground">sélectionnés dans chaque grand sujet</strong> (au moins 2 par sujet).
                </p>
                <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
                  {extraOnlyPreviews.map((p) => (
                    <li key={p.id} className="text-[12px] leading-relaxed">
                      <span className="font-medium text-foreground">
                        {p.media_name}
                      </span>
                      {p.country_code ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {p.country_code}
                        </span>
                      ) : null}
                      <br />
                      <span className="text-foreground-body">{previewLine(p)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="compose-instr-heading" className="space-y-2">
        <label
          htmlFor="compose-instructions"
          id="compose-instr-heading"
          className="block text-[12px] font-semibold text-foreground"
        >
          Consignes additionnelles pour la rédaction (optionnel)
        </label>
        <textarea
          id="compose-instructions"
          className="olj-focus min-h-[100px] w-full max-w-2xl rounded-md border border-border bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground"
          placeholder="Ex. insister sur le contraste Golfe / Iran, ton sobre, éviter tel pays…"
          value={instructionsText}
          onChange={(e) => onInstructionsChange(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Enregistrement automatique après une courte pause. Vous pouvez aussi lancer la rédaction : les consignes sont sauvegardées avant génération.
        </p>
      </section>

      <CoverageGaps
        selectedCountryCodes={selectedCountryCodes}
        targets={coverageQ.data ?? null}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="border border-foreground bg-foreground px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          disabled={!editionId || genAllMutation.isPending || topics.length === 0}
          onClick={() => void genAllMutation.mutateAsync()}
        >
          {genAllMutation.isPending
            ? "Rédaction en cours…"
            : "Rédiger toute la revue"}
        </button>
        <button
          type="button"
          className="olj-btn-secondary px-4 py-2 text-[13px] disabled:opacity-50"
          disabled={topics.length === 0}
          onClick={() => void copyAll()}
        >
          {copiedAll ? "Copié" : "Copier toute la revue"}
        </button>
        <button
          type="button"
          className="olj-btn-secondary px-4 py-2 text-[13px]"
          onClick={() => void flushInstructions()}
        >
          Enregistrer les consignes
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

      <section aria-labelledby="compose-topics-heading" className="space-y-10">
        <h2
          id="compose-topics-heading"
          className="olj-rubric border-b border-border pb-2"
        >
          Paragraphes par grand sujet ({topics.length})
        </h2>
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
          const nSelectedInTopic = previews.filter((p) =>
            selectedIds.has(p.id),
          ).length;

          return (
            <article
              key={t.id}
              className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="mb-4 flex flex-col gap-4 border-b border-border-light pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sujet {idx + 1} sur {topics.length}
                  </p>
                  <h3 className="mt-1 font-[family-name:var(--font-serif)] text-[19px] font-semibold leading-snug text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {nTexts} texte{nTexts > 1 ? "s" : ""} lié{nTexts > 1 ? "s" : ""}
                    {nCountries > 0 ? ` · ${nCountries} pays` : ""}
                    {nSelectedInTopic > 0
                      ? ` · ${nSelectedInTopic} sélectionné${nSelectedInTopic > 1 ? "s" : ""} pour la rédaction`
                      : " · aucune sélection explicite (repli sur les recommandations)"}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className="olj-btn-primary px-3 py-2 text-[12px] disabled:opacity-50"
                    disabled={!editionId || genTopicMutation.isPending}
                    onClick={() => {
                      setRegeneratingTopicId(t.id);
                      void genTopicMutation.mutateAsync({ topicId: t.id });
                    }}
                  >
                    {genTopicMutation.isPending && regeneratingTopicId === t.id
                      ? "Rédaction…"
                      : hasGen
                        ? "Rédiger à nouveau ce sujet"
                        : "Rédiger ce sujet"}
                  </button>
                  <button
                    type="button"
                    className="olj-btn-secondary px-3 py-2 text-[12px]"
                    onClick={() => void copyTopic(t)}
                  >
                    {copiedTopicId === t.id ? "Copié" : "Copier ce bloc"}
                  </button>
                </div>
              </div>

              {hasGen ? (
                <TopicGeneratedProse text={t.generated_text!} variant="compose" />
              ) : (
                <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-[14px] leading-relaxed text-muted-foreground">
                  Pas encore de texte : au moins deux articles doivent être disponibles pour ce sujet (sélection ou recommandations). Ajustez les coches sur le sommaire si besoin, puis cliquez sur « Rédiger ce sujet ».
                </p>
              )}
            </article>
          );
        })}
      </section>

      {topics.length === 0 && !topicsQ.isPending ? (
        <p className="text-[13px] text-muted-foreground">
          Aucun sujet pour cette édition. Lancez la détection des sujets depuis le sommaire.
        </p>
      ) : null}

      {genTopicMutation.isError ? (
        <p className="text-[12px] text-accent" role="alert">
          {(genTopicMutation.error as Error)?.message ??
            "Échec de la rédaction d’un sujet."}
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
