"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Edition } from "@/lib/types";
import { TopicDetail } from "@/components/composition/TopicDetail";

export default function EditionTopicPage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";
  const topicId = typeof params.id === "string" ? params.id : "";

  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
    staleTime: 5 * 60 * 1000,
  });

  const editionId = editionQ.data?.id;

  const detailQ = useQuery({
    queryKey: ["editionTopicDetail", editionId, topicId] as const,
    queryFn: () => api.editionTopicDetail(editionId!, topicId),
    enabled: Boolean(editionId && topicId),
  });

  const ids = detailQ.data?.article_ids ?? [];
  const idKey = ids.join(",");

  const articlesQ = useQuery({
    queryKey: ["topicArticles", idKey] as const,
    queryFn: () => api.articlesByIds(ids),
    enabled: ids.length > 0,
  });

  const coverageQ = useQuery({
    queryKey: ["coverageTargets"] as const,
    queryFn: () => api.coverageTargets(),
  });

  const topic = detailQ.data?.topic ?? null;
  const articles = articlesQ.data?.articles ?? [];
  const refs = detailQ.data?.article_refs ?? [];

  const editionLoading = editionQ.isPending;
  const editionErr =
    editionQ.error instanceof Error
      ? editionQ.error.message
      : editionQ.error
        ? "Édition indisponible."
        : null;
  const editionMissing =
    !editionLoading &&
    !editionQ.isError &&
    editionQ.isFetched &&
    !editionId &&
    Boolean(date);

  const detailLoading = Boolean(editionId && topicId && detailQ.isPending);
  const detailErr =
    detailQ.error instanceof Error
      ? detailQ.error.message
      : detailQ.error
        ? "Sujet introuvable."
        : null;

  const articlesBlocking =
    ids.length > 0 && (articlesQ.isPending || articlesQ.isFetching);

  const articlesErr =
    ids.length > 0 && articlesQ.isError
      ? articlesQ.error instanceof Error
        ? articlesQ.error.message
        : "Chargement des articles impossible."
      : null;

  const showTopic =
    topic &&
    editionId &&
    detailQ.isSuccess &&
    !detailErr &&
    (ids.length === 0 ||
      articlesQ.isSuccess ||
      (articlesQ.isError && ids.length > 0));

  return (
    <div className="space-y-6">
      <nav className="text-[13px] text-muted-foreground">
        <Link
          href={`/edition/${date}`}
          className="underline-offset-4 hover:underline"
        >
          Sujets du jour
        </Link>
      </nav>

      {editionLoading && (
        <p className="text-[13px] text-muted-foreground" role="status">
          Chargement de l’édition…
        </p>
      )}
      {editionErr && (
        <p className="text-[13px] text-destructive" role="alert">
          {editionErr}
        </p>
      )}
      {editionMissing && (
        <p className="text-[13px] text-foreground-body" role="status">
          Aucune édition en base pour cette date. Vérifiez la date ou lancez le
          traitement complet.
        </p>
      )}

      {!editionLoading && !editionErr && !editionMissing && detailLoading && (
        <p className="text-[13px] text-muted-foreground" role="status">
          Chargement du sujet…
        </p>
      )}
      {detailErr && !detailLoading && (
        <p className="text-[13px] text-destructive" role="alert">
          {detailErr}
        </p>
      )}

      {showTopic && articlesBlocking && !articlesQ.isError && (
        <p className="text-[13px] text-muted-foreground" role="status">
          Chargement des textes…
        </p>
      )}
      {articlesErr && detailQ.isSuccess && topic && (
        <p className="text-[13px] text-destructive" role="alert">
          {articlesErr}
        </p>
      )}

      {showTopic && !articlesBlocking && (
        <TopicDetail
          editionId={editionId}
          publishDate={date}
          topic={topic}
          articles={articles}
          articleRefs={refs}
          articleIdsOrder={ids}
          countryLabelsFr={coverageQ.data?.labels_fr ?? null}
        />
      )}

      {detailQ.isSuccess && !topic && editionId && (
        <p className="text-[13px] text-muted-foreground" role="status">
          Ce sujet n’existe pas pour cette édition.
        </p>
      )}
    </div>
  );
}
