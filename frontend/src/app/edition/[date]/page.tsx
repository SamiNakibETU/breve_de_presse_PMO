"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { ClusterFallbackRow, Edition } from "@/lib/types";
import { EditionSummary } from "@/components/composition/EditionSummary";

export default function EditionSommairePage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";

  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
  });

  const editionId = editionQ.data?.id;

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "previews"] as const,
    queryFn: () =>
      api.editionTopics(editionId!, { includeArticlePreviews: true }),
    enabled: Boolean(editionId),
  });

  const fallbackQ = useQuery({
    queryKey: ["editionFallback", editionId] as const,
    queryFn: (): Promise<ClusterFallbackRow[]> =>
      api.editionClustersFallback(editionId!),
    enabled:
      Boolean(editionId) &&
      !topicsQ.isPending &&
      (topicsQ.data?.length === 0 ||
        editionQ.data?.status === "CURATION_FAILED"),
  });

  const loading = editionQ.isPending || (editionQ.data && topicsQ.isPending);
  const edition = editionQ.data ?? null;
  const topics = topicsQ.data ?? [];
  const err = editionQ.error?.message ?? topicsQ.error?.message ?? null;

  const showFallback =
    edition &&
    !topicsQ.isPending &&
    topics.length === 0 &&
    (fallbackQ.data?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Sommaire
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          Édition du {date}
        </h1>
        {edition && (
          <p className="mt-1 text-[13px] text-foreground-muted">
            {edition.status === "CURATING"
              ? "Sommaire proposé — validez les sujets et les articles."
              : edition.status === "COLLECTING" || edition.status === "SCHEDULED"
                ? "Collecte ou traitement en cours."
                : edition.status === "CURATION_FAILED"
                  ? "Le sommaire automatique n’a pas pu être finalisé."
                  : `État : ${edition.status}`}
          </p>
        )}
      </header>

      {err && (
        <p
          className="border-l-2 border-destructive pl-3 text-[13px] text-destructive"
          role="alert"
          aria-live="polite"
        >
          {err}
        </p>
      )}

      {!showFallback && (
        <EditionSummary topics={topics} date={date} loading={!!loading} />
      )}

      {showFallback && fallbackQ.data && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Sujets détectés (secours)
          </h2>
          <p className="text-[13px] text-foreground-body">
            Navigation provisoire à partir des clusters étiquetés. Le sommaire
            éditorial pourra être relancé depuis la régie.
          </p>
          <ul className="space-y-2 text-[13px]">
            {fallbackQ.data.map((c) => (
              <li key={c.cluster_id} className="border-b border-border-light py-2">
                <span className="font-medium">
                  {c.label ?? "Sans libellé"}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {c.article_count} article{c.article_count > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="border-t border-border pt-4 text-[13px] text-muted-foreground">
        <Link href="/dashboard" className="underline-offset-4 hover:underline">
          Sujets du jour (vue technique)
        </Link>
        {" · "}
        <Link href="/regie" className="underline-offset-4 hover:underline">
          Régie
        </Link>
      </nav>
    </div>
  );
}
