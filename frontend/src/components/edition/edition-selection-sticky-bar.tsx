"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { api } from "@/lib/api";

type Props = {
  /** Date d’édition YYYY-MM-DD (segment URL). */
  editionDate: string;
};

/**
 * Barre fixe bas de page : couverture + sélections + lien Rédaction.
 * Données alignées sur le sommaire (GET selections + topics avec aperçus).
 */
export function EditionSelectionStickyBar({ editionDate }: Props) {
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
    staleTime: 15_000,
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

  const { selectionCount, topicCountWithSelection, selectedCountryCodes } =
    useMemo(() => {
      const topics = selectionsQ.data?.topics;
      const extraIds = selectionsQ.data?.extra_article_ids ?? [];
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
    }, [selectionsQ.data, idToCountryCode]);

  if (!editionDate || selectionCount === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="pointer-events-auto mx-auto max-w-[80rem] border-t border-border bg-background px-5 py-3 shadow-[0_-6px_24px_rgba(27,26,26,0.06)] sm:px-6">
        <CoverageGaps
          selectedCountryCodes={selectedCountryCodes}
          targets={coverageQ.data ?? null}
          compact
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-center text-[12px] text-muted-foreground sm:text-left">
            <span className="tabular-nums font-medium text-foreground">
              {selectionCount}
            </span>{" "}
            article{selectionCount > 1 ? "s" : ""} sélectionné
            {selectionCount > 1 ? "s" : ""}
            {topicCountWithSelection > 0 ? (
              <>
                {" "}
                dans{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {topicCountWithSelection}
                </span>{" "}
                sujet{topicCountWithSelection > 1 ? "s" : ""}
              </>
            ) : null}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Link
              href={`/edition/${editionDate}/compose`}
              className="olj-btn-primary w-full text-center sm:w-auto"
            >
              Aller à la rédaction
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
