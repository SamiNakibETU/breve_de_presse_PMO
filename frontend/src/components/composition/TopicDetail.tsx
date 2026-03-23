"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Article, EditionTopic, TopicArticleRef } from "@/lib/types";
import {
  groupArticlesByCountryIfNeeded,
  partitionArticlesBySelection,
  sortArticlesByTopicRefs,
} from "@/lib/groupTopicArticles";
import { ArticleRow } from "./ArticleRow";
import { TopicGeneratedProse } from "./TopicGeneratedProse";
import { TopicSubjectSummary } from "./TopicSubjectSummary";

function ArticleBlock({
  title,
  articles,
  refs,
  articleIdsOrder,
  selected,
  onToggle,
  countryLabelsFr,
  emptyMessage,
}: {
  title: string;
  articles: Article[];
  refs: TopicArticleRef[];
  articleIdsOrder: string[];
  selected: ReadonlySet<string>;
  onToggle: (articleId: string, next: boolean) => void;
  countryLabelsFr?: Record<string, string> | null;
  emptyMessage?: string;
}) {
  const sorted = useMemo(
    () => sortArticlesByTopicRefs(articles, refs, articleIdsOrder),
    [articles, refs, articleIdsOrder],
  );

  const groups = useMemo(
    () => groupArticlesByCountryIfNeeded(sorted, countryLabelsFr ?? undefined),
    [sorted, countryLabelsFr],
  );

  return (
    <div className="space-y-4">
      <h3 className="border-b border-border pb-1.5 font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground">
        {title}
      </h3>
      {sorted.length === 0 ? (
        emptyMessage ? (
          <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
        ) : null
      ) : null}
      {sorted.length > 0
        ? groups.map((g) => (
            <div key={g.countryCode || "all"} className="space-y-0">
              {g.label ? (
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {g.label}
                </p>
              ) : null}
              <div>
                {g.articles.map((a) => (
                  <ArticleRow
                    key={a.id}
                    article={a}
                    selected={selected.has(a.id)}
                    onSelectedChange={(v) => onToggle(a.id, v)}
                  />
                ))}
              </div>
            </div>
          ))
        : null}
    </div>
  );
}

export function TopicDetail({
  editionId,
  publishDate,
  topic,
  articles,
  articleRefs,
  articleIdsOrder,
  countryLabelsFr,
}: {
  editionId: string;
  publishDate: string;
  topic: EditionTopic;
  articles: Article[];
  articleRefs: TopicArticleRef[];
  articleIdsOrder: string[];
  countryLabelsFr?: Record<string, string> | null;
}) {
  const qc = useQueryClient();
  const initialSelected = useMemo(() => {
    const s = new Set<string>();
    for (const r of articleRefs) {
      if (r.is_selected) s.add(r.article_id);
    }
    return s;
  }, [articleRefs]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);

  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected]);

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.editionTopicSelection(editionId, topic.id, ids),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["editionTopicDetail", editionId, topic.id],
      });
    },
  });

  const genMutation = useMutation({
    mutationFn: () =>
      api.editionTopicGenerate(
        editionId,
        topic.id,
        Array.from(selected).length > 0 ? Array.from(selected) : null,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
      qc.invalidateQueries({
        queryKey: ["editionTopicDetail", editionId, topic.id],
      });
      qc.invalidateQueries({ queryKey: ["edition", publishDate] });
    },
  });

  const byId = useMemo(() => {
    const m = new Map<string, Article>();
    for (const a of articles) m.set(a.id, a);
    return m;
  }, [articles]);

  const orderedArticles = useMemo(() => {
    const out: Article[] = [];
    for (const id of articleIdsOrder) {
      const a = byId.get(id);
      if (a) out.push(a);
    }
    for (const a of articles) {
      if (!articleIdsOrder.includes(a.id)) out.push(a);
    }
    return out;
  }, [articleIdsOrder, articles, byId]);

  const { retained, others } = useMemo(
    () => partitionArticlesBySelection(orderedArticles, selected),
    [orderedArticles, selected],
  );

  const retainedEmptyMessage =
    orderedArticles.length === 0
      ? "Aucun texte n’est rattaché à ce sujet."
      : "Aucun article sélectionné. Cochez les textes à inclure dans la revue.";

  const othersEmptyMessage =
    orderedArticles.length === 0
      ? "Aucun texte n’est rattaché à ce sujet."
      : others.length === 0
        ? "Tous les textes liés figurent dans la sélection ci-dessus."
        : "";

  const toggle = (articleId: string, next: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (next) n.add(articleId);
      else n.delete(articleId);
      saveMutation.mutate(Array.from(n));
      return n;
    });
  };

  return (
    <article className="space-y-10">
      <TopicSubjectSummary
        topic={topic}
        countryLabelsFr={countryLabelsFr}
        publishDate={publishDate}
        articleCount={orderedArticles.length}
      />

      <section className="space-y-3">
        <h2 className="border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Textes rattachés à ce sujet
        </h2>
        <p className="text-[13px] leading-relaxed text-foreground-muted">
          Sélectionnez les articles à inclure dans la revue. Les textes cochés
          apparaissent en tête pour faciliter la lecture.
        </p>

        <div className="space-y-8 pt-2">
          <ArticleBlock
            title="Retenus pour ce sujet"
            articles={retained}
            refs={articleRefs}
            articleIdsOrder={articleIdsOrder}
            selected={selected}
            onToggle={toggle}
            countryLabelsFr={countryLabelsFr}
            emptyMessage={retainedEmptyMessage}
          />
          <ArticleBlock
            title="Autres textes liés"
            articles={others}
            refs={articleRefs}
            articleIdsOrder={articleIdsOrder}
            selected={selected}
            onToggle={toggle}
            countryLabelsFr={countryLabelsFr}
            emptyMessage={othersEmptyMessage}
          />
        </div>

        {saveMutation.isError && (
          <p className="text-[12px] text-accent" role="alert">
            Enregistrement de la sélection impossible.
          </p>
        )}
      </section>

      <section className="border-t border-border-light pt-6">
        <h2 className="mb-3 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Texte généré
        </h2>
        <button
          type="button"
          className="border border-primary bg-primary px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          disabled={genMutation.isPending || orderedArticles.length < 2}
          onClick={() => genMutation.mutate()}
        >
          {genMutation.isPending ? "Génération…" : "Générer le texte"}
        </button>
        {orderedArticles.length < 2 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Sélectionnez au moins deux articles pour lancer la génération.
          </p>
        )}
        {genMutation.isError && (
          <p className="mt-2 text-[12px] text-accent" role="alert">
            {(genMutation.error as Error)?.message ?? "Échec de la génération."}
          </p>
        )}
        {genMutation.isSuccess && genMutation.data?.status === "ok" && (
          <p className="mt-2 text-[12px] text-success">
            Texte prêt. Vous pouvez le copier depuis la page « Texte final » ou
            ci-dessous.
          </p>
        )}
        {topic.generated_text ? (
          <TopicGeneratedProse text={topic.generated_text} />
        ) : null}
      </section>
    </article>
  );
}
