"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { api } from "@/lib/api";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import {
  nextSelectionsAfterRemove,
  useSelectionStore,
} from "@/stores/selection-store";
import type { EditionSelectionsResponse } from "@/lib/types";

type Props = {
  /** Date d’édition YYYY-MM-DD (segment URL). */
  editionDate: string;
};

type SelectedRow = {
  id: string;
  title: string;
  media: string;
  countryCode: string;
  topicId: string | null;
  isExtra: boolean;
};

/**
 * Barre fixe bas de page : couverture + sélections + lien Rédaction.
 * Données alignées sur le sommaire (GET selections + topics avec aperçus).
 */
export function EditionSelectionStickyBar({ editionDate }: Props) {
  const qc = useQueryClient();
  const [listOpen, setListOpen] = useState(false);

  const editionQ = useQuery({
    queryKey: ["edition", editionDate] as const,
    queryFn: () => api.editionByDate(editionDate),
    enabled: Boolean(editionDate),
    staleTime: 5 * 60 * 1000,
  });

  const editionId = editionQ.data?.id;

  const coverageQ = useQuery({
    queryKey: ["coverageTargets"] as const,
    queryFn: () => api.coverageTargets(),
    staleTime: 5 * 60 * 1000,
  });

  const selectionsQ = useQuery({
    queryKey: ["editionSelections", editionId] as const,
    queryFn: () => api.editionSelections(editionId!),
    enabled: Boolean(editionId),
    staleTime: 30_000,
    /* Pas de polling — le store Zustand gère l'état UI instantané */
  });

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "stickyBar"] as const,
    queryFn: () =>
      api.editionTopics(editionId!, {
        includeArticlePreviews: true,
        maxArticlePreviewsPerTopic: 200,
      }),
    enabled: Boolean(editionId),
    staleTime: 15_000,
  });

  const idToCountryCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of topicsQ.data ?? []) {
      for (const p of t.article_previews ?? []) {
        const c = p.country_code?.trim();
        if (c) {
          m.set(p.id, c.toUpperCase());
        }
      }
    }
    for (const p of selectionsQ.data?.extra_articles ?? []) {
      const c = p.country_code?.trim();
      if (c) {
        m.set(p.id, c.toUpperCase());
      }
    }
    return m;
  }, [topicsQ.data, selectionsQ.data?.extra_articles]);

  const previewById = useMemo(() => {
    const m = new Map<
      string,
      { title: string; media: string; countryCode: string }
    >();
    for (const t of topicsQ.data ?? []) {
      for (const p of t.article_previews ?? []) {
        const title = (p.title_fr || p.title_original || "Sans titre").trim();
        m.set(p.id, {
          title,
          media: p.media_name?.trim() || "—",
          countryCode: (p.country_code ?? "").trim().toUpperCase() || "—",
        });
      }
    }
    for (const p of selectionsQ.data?.extra_articles ?? []) {
      const title = (p.title_fr || p.title_original || "Sans titre").trim();
      m.set(p.id, {
        title,
        media: p.media_name?.trim() || "—",
        countryCode: (p.country_code ?? "").trim().toUpperCase() || "—",
      });
    }
    return m;
  }, [topicsQ.data, selectionsQ.data?.extra_articles]);

  const selectedRows = useMemo((): SelectedRow[] => {
    const out: SelectedRow[] = [];
    const topics = selectionsQ.data?.topics;
    if (topics) {
      for (const [topicId, ids] of Object.entries(topics)) {
        for (const id of ids) {
          const meta = previewById.get(id);
          out.push({
            id,
            title: meta?.title ?? id.slice(0, 8),
            media: meta?.media ?? "—",
            countryCode: meta?.countryCode ?? "—",
            topicId,
            isExtra: false,
          });
        }
      }
    }
    for (const id of selectionsQ.data?.extra_article_ids ?? []) {
      const meta = previewById.get(id);
      out.push({
        id,
        title: meta?.title ?? id.slice(0, 8),
        media: meta?.media ?? "—",
        countryCode: meta?.countryCode ?? "—",
        topicId: null,
        isExtra: true,
      });
    }
    return out;
  }, [selectionsQ.data, previewById]);

  const removeMutation = useMutation({
    mutationFn: async (row: SelectedRow) => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      if (row.isExtra) {
        const cur = qc.getQueryData<EditionSelectionsResponse>([
          "editionSelections",
          editionId,
        ])?.extra_article_ids ??
          selectionsQ.data?.extra_article_ids ??
          [];
        await api.editionComposePreferences(editionId, {
          extra_selected_article_ids: cur.filter((x) => x !== row.id),
        });
        return;
      }
      if (row.topicId) {
        const bundle =
          qc.getQueryData<EditionSelectionsResponse>([
            "editionSelections",
            editionId,
          ]) ?? selectionsQ.data;
        const cur = bundle?.topics[row.topicId] ?? [];
        await api.editionTopicSelection(
          editionId,
          row.topicId,
          cur.filter((x) => x !== row.id),
        );
      }
    },
    onMutate: async (row) => {
      if (!editionId) return undefined;
      await qc.cancelQueries({ queryKey: ["editionSelections", editionId] });
      const previous = qc.getQueryData<EditionSelectionsResponse>([
        "editionSelections",
        editionId,
      ]);
      if (!previous) return undefined;
      const next = nextSelectionsAfterRemove(previous, row);
      qc.setQueryData(["editionSelections", editionId], next);
      useSelectionStore.getState().hydrateFromServer(editionId, next);
      return { previous } as const;
    },
    onError: (_err, _row, ctx) => {
      if (!editionId || !ctx?.previous) return;
      qc.setQueryData(["editionSelections", editionId], ctx.previous);
      useSelectionStore.getState().hydrateFromServer(editionId, ctx.previous);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  // Lecture du store Zustand pour un count instantané (0 latence perçue).
  // Le store est mis à jour synchroniquement par le composant parent dès le clic.
  const storeBundle = useSelectionStore((s) =>
    editionId ? s.byEditionId[editionId] : undefined,
  );

  const { selectionCount, topicCountWithSelection, selectedCountryCodes } =
    useMemo(() => {
      // Priorité : store Zustand (réactif instantané) > données serveur (fallback initial)
      const topics = storeBundle?.topics ?? selectionsQ.data?.topics;
      const extraIds = storeBundle?.extra_article_ids ?? selectionsQ.data?.extra_article_ids ?? [];
      let n = 0;
      let topicsWithSel = 0;
      if (topics) {
        for (const ids of Object.values(topics)) {
          if (ids.length > 0) {
            topicsWithSel += 1;
          }
          n += ids.length;
        }
      }
      n += extraIds.length;
      const codes = new Set<string>();
      if (topics) {
        for (const ids of Object.values(topics)) {
          for (const id of ids) {
            const c = idToCountryCode.get(id);
            if (c) {
              codes.add(c);
            }
          }
        }
      }
      for (const id of extraIds) {
        const c = idToCountryCode.get(id);
        if (c) {
          codes.add(c);
        }
      }
      return {
        selectionCount: n,
        topicCountWithSelection: topicsWithSel,
        selectedCountryCodes: [...codes],
      };
    }, [storeBundle, selectionsQ.data, idToCountryCode]);

  if (!editionDate || selectionCount === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in-0 motion-safe:[animation-duration:200ms]">
      <div className="pointer-events-auto mx-auto max-w-[80rem] px-4 pb-3 sm:px-6">
        <div className="rounded-2xl border border-border/70 bg-background/94 shadow-[0_-8px_32px_rgba(0,0,0,0.06)] backdrop-blur-md">
          <div className="border-b border-border/40 px-4 py-2.5 sm:px-5">
            <CoverageGaps
              selectedCountryCodes={selectedCountryCodes}
              targets={coverageQ.data ?? null}
              compact
            />
          </div>
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-center text-[12px] text-muted-foreground sm:text-left">
                <span className="tabular-nums font-semibold text-foreground">
                  {selectionCount}
                </span>{" "}
                article{selectionCount > 1 ? "s" : ""} sélectionné
                {selectionCount > 1 ? "s" : ""}
                {topicCountWithSelection > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="tabular-nums font-semibold text-foreground">
                      {topicCountWithSelection}
                    </span>{" "}
                    sujet{topicCountWithSelection > 1 ? "s" : ""}
                  </>
                ) : null}
              </p>
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-foreground underline decoration-border underline-offset-2 hover:text-accent hover:decoration-accent/50"
                onClick={() => setListOpen((v) => !v)}
                aria-expanded={listOpen}
              >
                {listOpen ? "Masquer la liste" : "Voir la liste"}
              </button>
              {listOpen ? (
                <ul className="mt-2 max-h-44 space-y-0 overflow-y-auto rounded-xl border border-border/50 bg-muted/15 p-1.5 text-[11px]">
                  {selectedRows.map((row) => {
                    const flag =
                      row.countryCode && row.countryCode !== "—"
                        ? REGION_FLAG_EMOJI[row.countryCode]
                        : null;
                    const removingThis =
                      removeMutation.isPending &&
                      removeMutation.variables?.id === row.id;
                    return (
                      <li
                        key={`${row.id}-${row.isExtra ? "x" : row.topicId}`}
                        className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                      >
                        <span className="min-w-0">
                          {flag ? (
                            <span className="mr-1" aria-hidden>
                              {flag}
                            </span>
                          ) : null}
                          <span className="font-medium text-foreground">
                            {row.media}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            {row.title.length > 90
                              ? `${row.title.slice(0, 90)}…`
                              : row.title}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="olj-focus shrink-0 rounded-md border border-transparent px-2 py-0.5 text-[13px] leading-none text-muted-foreground hover:border-border hover:bg-background hover:text-destructive disabled:opacity-40"
                          disabled={removingThis}
                          aria-label="Retirer de la sélection"
                          onClick={() => removeMutation.mutate(row)}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Link
                href={`/edition/${editionDate}/compose`}
                className="olj-btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-[13px] sm:w-auto"
              >
                <span>Rédaction</span>
                <span
                  className="inline-flex min-h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-accent-foreground/18 px-1.5 text-[11px] font-bold tabular-nums"
                  aria-label={`${selectionCount} article${selectionCount > 1 ? "s" : ""} en sélection`}
                >
                  {selectionCount}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
