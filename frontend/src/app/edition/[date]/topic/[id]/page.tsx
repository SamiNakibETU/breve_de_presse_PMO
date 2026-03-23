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

  return (
    <div className="space-y-6">
      <nav className="text-[13px] text-muted-foreground">
        <Link
          href={`/edition/${date}`}
          className="underline-offset-4 hover:underline"
        >
          Sommaire de l’édition
        </Link>
      </nav>
      {topic && editionId && (
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
      {detailQ.isPending && (
        <p className="text-[13px] text-foreground-muted">Chargement du sujet…</p>
      )}
      {detailQ.error && (
        <p className="text-[13px] text-accent" role="alert" aria-live="polite">
          Sujet introuvable.
        </p>
      )}
    </div>
  );
}
