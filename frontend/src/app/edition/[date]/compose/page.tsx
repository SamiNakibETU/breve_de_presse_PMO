"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  Edition,
  EditionSelectionsResponse,
  EditionTopic,
  TopicArticlePreview,
} from "@/lib/types";
import {
  type ComposeInstructionsPayload,
  DEFAULT_COMPOSE_INSTRUCTIONS,
  buildInstructionSuffixForLlm,
  parseComposeInstructions,
  stringifyComposeInstructions,
} from "@/lib/compose-instructions";
import { ComposeInstructions } from "@/components/composition/ComposeInstructions";
import { CopyExportButtons } from "@/components/composition/CopyExportButtons";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { TopicReorderList } from "@/components/composition/TopicReorderList";
import { ComposeHeader } from "@/components/composition/ComposeHeader";
import { ComposeSelectionPanel } from "@/components/composition/ComposeSelectionPanel";
import { ComposeActions } from "@/components/composition/ComposeActions";
import { ComposeTopicsPanel } from "@/components/composition/ComposeTopicsPanel";
import { formatEditionCalendarTitleFr } from "@/lib/dates-display-fr";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function topicPlainText(t: EditionTopic): string {
  const title = t.title_final ?? t.title_proposed;
  const body = t.generated_text?.trim();
  if (body) return `« ${title} »\n\n${body}`;
  return `« ${title} »\n\n(Texte non encore généré — utilisez « Rédiger ce bloc ».)`;
}

function editionTitleLine(date: string): string {
  try {
    const fr = formatEditionCalendarTitleFr(date);
    return fr.charAt(0).toUpperCase() + fr.slice(1);
  } catch {
    return date;
  }
}

function orderedSelectedPreviewsForTopic(
  topic: EditionTopic,
  topicsMap: Record<string, string[]>,
): TopicArticlePreview[] {
  const ids = topicsMap[topic.id] ?? [];
  const byId = new Map((topic.article_previews ?? []).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is TopicArticlePreview => Boolean(p));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ComposePage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";
  const qc = useQueryClient();

  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedTopicId, setCopiedTopicId] = useState<string | null>(null);
  const [regeneratingTopicId, setRegeneratingTopicId] = useState<string | null>(null);
  const [composeInstructions, setComposeInstructions] =
    useState<ComposeInstructionsPayload>(DEFAULT_COMPOSE_INSTRUCTIONS);
  const instrSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Queries ----
  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
  });
  const editionId = editionQ.data?.id;

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "compose"] as const,
    queryFn: () =>
      api.editionTopics(editionId!, { includeArticlePreviews: true, maxArticlePreviewsPerTopic: 200 }),
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

  // ---- Sync instructions from edition ----
  useEffect(() => {
    setComposeInstructions(parseComposeInstructions(editionQ.data?.compose_instructions_fr));
  }, [editionQ.data?.id, editionQ.data?.compose_instructions_fr]);

  // ---- Instructions save (debounced) ----
  const scheduleInstructionsSave = useCallback(
    (payload: ComposeInstructionsPayload) => {
      if (!editionId) return;
      if (instrSaveTimer.current) clearTimeout(instrSaveTimer.current);
      instrSaveTimer.current = setTimeout(() => {
        void api
          .editionComposePreferences(editionId, {
            compose_instructions_fr: stringifyComposeInstructions(payload),
          })
          .then(() => qc.invalidateQueries({ queryKey: ["edition", date] }))
          .catch(() => undefined);
        instrSaveTimer.current = null;
      }, 600);
    },
    [editionId, date, qc],
  );

  const onComposeInstructionsChange = useCallback(
    (next: ComposeInstructionsPayload) => {
      setComposeInstructions(next);
      scheduleInstructionsSave(next);
    },
    [scheduleInstructionsSave],
  );

  const flushInstructions = useCallback(async () => {
    if (!editionId) return;
    if (instrSaveTimer.current) {
      clearTimeout(instrSaveTimer.current);
      instrSaveTimer.current = null;
    }
    await api.editionComposePreferences(editionId, {
      compose_instructions_fr: stringifyComposeInstructions(composeInstructions),
    });
    await qc.invalidateQueries({ queryKey: ["edition", date] });
  }, [editionId, composeInstructions, date, qc]);

  // ---- Mutations ----
  const genAllMutation = useMutation({
    mutationFn: async () => {
      if (!editionId) throw new Error("Édition introuvable");
      await api.editionComposePreferences(editionId, {
        compose_instructions_fr: stringifyComposeInstructions(composeInstructions),
      });
      return api.editionGenerateAll(editionId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["edition", date] });
      void qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
    },
  });

  const genTopicMutation = useMutation({
    mutationFn: async ({ topicId }: { topicId: string }) => {
      if (!editionId) throw new Error("Édition introuvable");
      const suffix = buildInstructionSuffixForLlm(composeInstructions);
      await api.editionComposePreferences(editionId, {
        compose_instructions_fr: stringifyComposeInstructions(composeInstructions),
      });
      const sel = qc.getQueryData<EditionSelectionsResponse>(["editionSelections", editionId]);
      const ordered = sel?.topics[topicId] ?? [];
      return api.editionTopicGenerate(editionId, topicId, ordered.length >= 2 ? ordered : null, suffix);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
      void qc.invalidateQueries({ queryKey: ["edition", date] });
    },
    onSettled: () => setRegeneratingTopicId(null),
  });

  const reorderArticlesMutation = useMutation({
    mutationFn: async ({ topicId, orderedIds }: { topicId: string; orderedIds: string[] }) => {
      if (!editionId) throw new Error("Édition introuvable");
      await api.editionTopicSelection(editionId, topicId, orderedIds);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  const removeArticleMutation = useMutation({
    mutationFn: async ({ topicId, articleId }: { topicId: string; articleId: string }) => {
      if (!editionId) throw new Error("Édition introuvable");
      const cur = topicsSelectionMap[topicId] ?? [];
      await api.editionTopicSelection(editionId, topicId, cur.filter((id) => id !== articleId));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  const removeExtraArticleMutation = useMutation({
    mutationFn: async (articleId: string) => {
      if (!editionId) throw new Error("Édition introuvable");
      const cur = selectionsQ.data?.extra_article_ids ?? [];
      await api.editionComposePreferences(editionId, {
        extra_selected_article_ids: cur.filter((id) => id !== articleId),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  const reorderTopicsMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!editionId) throw new Error("Édition introuvable");
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i];
        if (id) await api.editionTopicPatch(editionId, id, { user_rank: i });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
    },
  });

  // ---- Derived state ----
  const topics = useMemo(() => {
    const list = topicsQ.data ?? [];
    return [...list].sort((a, b) => (a.user_rank ?? a.rank ?? 999) - (b.user_rank ?? b.rank ?? 999));
  }, [topicsQ.data]);

  const topicsSelectionMap = useMemo(() => selectionsQ.data?.topics ?? {}, [selectionsQ.data]);

  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const ids of Object.values(topicsSelectionMap)) for (const id of ids) s.add(id);
    for (const id of selectionsQ.data?.extra_article_ids ?? []) s.add(id);
    return s;
  }, [topicsSelectionMap, selectionsQ.data]);

  const selectedCountryCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const t of topics)
      for (const p of t.article_previews ?? [])
        if (selectedIds.has(p.id) && p.country_code?.trim())
          codes.add(p.country_code.trim().toUpperCase());
    for (const p of selectionsQ.data?.extra_articles ?? [])
      if (selectedIds.has(p.id) && p.country_code?.trim())
        codes.add(p.country_code.trim().toUpperCase());
    return [...codes];
  }, [topics, selectedIds, selectionsQ.data?.extra_articles]);

  const selectedAnalysisCount = useMemo(() => {
    let n = 0;
    for (const t of topics)
      for (const p of t.article_previews ?? [])
        if (selectedIds.has(p.id) && p.analysis_bullets_fr?.length) n++;
    for (const p of selectionsQ.data?.extra_articles ?? [])
      if (selectedIds.has(p.id) && p.analysis_bullets_fr?.length) n++;
    return n;
  }, [topics, selectedIds, selectionsQ.data?.extra_articles]);

  const selectionByTopic = useMemo(() => {
    const out: { topic: EditionTopic; picked: TopicArticlePreview[] }[] = [];
    for (const t of topics) {
      const picked = orderedSelectedPreviewsForTopic(t, topicsSelectionMap);
      if (picked.length > 0) out.push({ topic: t, picked });
    }
    return out;
  }, [topics, topicsSelectionMap]);

  const topicsWithTwoPlusSelections = useMemo(() => {
    let n = 0;
    for (const t of topics)
      if (orderedSelectedPreviewsForTopic(t, topicsSelectionMap).length >= 2) n++;
    return n;
  }, [topics, topicsSelectionMap]);

  const assembledPlain = useMemo(
    () => topics.map((t) => topicPlainText(t)).join("\n\n\n\n"),
    [topics],
  );

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(assembledPlain);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setCopiedAll(false);
    }
  }, [assembledPlain]);

  const copyTopic = useCallback(async (t: EditionTopic) => {
    try {
      await navigator.clipboard.writeText(topicPlainText(t));
      setCopiedTopicId(t.id);
      window.setTimeout(() => setCopiedTopicId(null), 2000);
    } catch {
      setCopiedTopicId(null);
    }
  }, []);

  // ---- Render ----
  return (
    <div className="space-y-10">
      <ComposeHeader
        date={date}
        titleFr={editionTitleLine(date)}
        kpis={[
          { label: "Articles sélectionnés", value: selectedIds.size },
          { label: "Sujets", value: topics.length },
          { label: "Pays couverts", value: selectedCountryCodes.length },
          { label: "Analyses disponibles", value: selectedAnalysisCount },
        ]}
        hasSelection={selectedIds.size > 0}
      />

      <ComposeSelectionPanel
        date={date}
        totalSelected={selectedIds.size}
        isLoading={selectionsQ.isPending}
        selectionByTopic={selectionByTopic}
        extraOnlyPreviews={selectionsQ.data?.extra_articles ?? []}
        reorderDisabled={!editionId || reorderArticlesMutation.isPending}
        removeDisabled={removeArticleMutation.isPending}
        removeExtraDisabled={removeExtraArticleMutation.isPending}
        onOrderChange={(topicId, orderedIds) =>
          reorderArticlesMutation.mutate({ topicId, orderedIds })
        }
        onRemoveArticle={(topicId, articleId) =>
          removeArticleMutation.mutate({ topicId, articleId })
        }
        onRemoveExtra={(articleId) => removeExtraArticleMutation.mutate(articleId)}
      />

      <ComposeInstructions value={composeInstructions} onChange={onComposeInstructionsChange} />

      {topics.length > 1 && (
        <TopicReorderList
          topics={topics}
          onOrderChange={(ids) => reorderTopicsMutation.mutate(ids)}
          disabled={reorderTopicsMutation.isPending}
          collapsible
        />
      )}

      {selectedIds.size > 0 && (
        <CoverageGaps
          selectedCountryCodes={selectedCountryCodes}
          targets={coverageQ.data ?? null}
        />
      )}

      <ComposeActions
        editionId={editionId}
        topicsCount={topics.length}
        topicsWithTwoPlusSelections={topicsWithTwoPlusSelections}
        isGeneratingAll={genAllMutation.isPending}
        isError={genAllMutation.isError}
        isPartial={genAllMutation.isSuccess && genAllMutation.data?.status === "partial"}
        errorMessage={(genAllMutation.error as Error)?.message ?? "Échec"}
        copiedAll={copiedAll}
        onGenerateAll={() => void genAllMutation.mutateAsync()}
        onCopyAll={() => void copyAll()}
        onSaveInstructions={() => void flushInstructions()}
      />

      <ComposeTopicsPanel
        date={date}
        topics={topics}
        topicsSelectionMap={topicsSelectionMap}
        isLoadingTopics={topicsQ.isPending}
        regeneratingTopicId={regeneratingTopicId}
        copiedTopicId={copiedTopicId}
        isGeneratingTopic={genTopicMutation.isPending}
        isGenerateTopicError={genTopicMutation.isError}
        generateTopicErrorMessage={
          (genTopicMutation.error as Error)?.message ?? "Échec de la rédaction d'un sujet."
        }
        onGenerateTopic={(topicId) => {
          setRegeneratingTopicId(topicId);
          void genTopicMutation.mutateAsync({ topicId });
        }}
        onCopyTopic={(t) => void copyTopic(t)}
      />

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
