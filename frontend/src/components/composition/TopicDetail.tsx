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
import { countryCodesFromArticles } from "@/lib/topic-country-codes";
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
      <h3 className="border-b border-border pb-1.5 font-[family-name:var(--font-serif)] text-[15px] font-semibold leading-snug text-foreground">
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
                <p className="mb-2 flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
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

  const recommendedIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of articleRefs) {
      if (r.is_recommended) {
        s.add(r.article_id);
      }
    }
    return s;
  }, [articleRefs]);

  const recommendedArticles = useMemo(
    () => orderedArticles.filter((a) => recommendedIds.has(a.id)),
    [orderedArticles, recommendedIds],
  );

  const articlesOutsideRecommended = useMemo(
    () => orderedArticles.filter((a) => !recommendedIds.has(a.id)),
    [orderedArticles, recommendedIds],
  );

  const { retained, others } = useMemo(
    () => partitionArticlesBySelection(articlesOutsideRecommended, selected),
    [articlesOutsideRecommended, selected],
  );

  const retainedEmptyMessage =
    orderedArticles.length === 0
      ? "Aucun texte n’est rattaché à ce sujet."
      : articlesOutsideRecommended.length === 0
        ? "Tous les textes de ce sujet sont dans « Regards mis en avant ». Cochez-les dans ce bloc pour la revue ; ce qui suit ne s’applique pas."
        : "Aucun texte supplémentaire coché ici. Ce bloc est facultatif : servez-vous des cases dans « Regards mis en avant » pour la revue, ou cochez d’autres articles ci-dessous si besoin.";

  const othersEmptyMessage =
    orderedArticles.length === 0
      ? "Aucun texte n’est rattaché à ce sujet."
      : others.length === 0
        ? "Tous les textes liés sont cochés ou classés dans les blocs au-dessus."
        : "";

  const selectedCount = selected.size;
  const canGenerate =
    orderedArticles.length >= 2 &&
    (selectedCount === 0 || selectedCount >= 2);

  const displayCountryCodes = useMemo(
    () => countryCodesFromArticles(orderedArticles),
    [orderedArticles],
  );

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
        countryCodesForDisplay={displayCountryCodes}
      />

      <section className="space-y-3">
        <h2 className="border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Textes rattachés à ce sujet
        </h2>

        <div className="space-y-8 pt-2">
          {recommendedArticles.length > 0 ? (
            <ArticleBlock
              title="Regards mis en avant (un texte par pays)"
              articles={recommendedArticles}
              refs={articleRefs}
              articleIdsOrder={articleIdsOrder}
              selected={selected}
              onToggle={toggle}
              countryLabelsFr={countryLabelsFr}
              emptyMessage={undefined}
            />
          ) : null}
          <ArticleBlock
            title="Complément pour la revue (hors regard mis en avant)"
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
          className="olj-btn-primary disabled:opacity-50"
          disabled={genMutation.isPending || !canGenerate}
          onClick={() => genMutation.mutate()}
        >
          {genMutation.isPending ? "Génération…" : "Générer le texte"}
        </button>
        {orderedArticles.length < 2 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Il faut au moins deux textes rattachés à ce sujet pour générer.
          </p>
        )}
        {orderedArticles.length >= 2 && selectedCount === 1 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Pour une sélection manuelle, cochez <strong className="font-medium text-foreground">au moins deux</strong>{" "}
            textes — ou <strong className="font-medium text-foreground">décochez tout</strong> pour que le système
            s’appuie sur les regards mis en avant (ou l’ensemble des textes du sujet).
          </p>
        )}
        {orderedArticles.length >= 2 && selectedCount === 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Aucune case cochée : la génération utilisera d’abord les textes recommandés, sinon tous les textes du sujet.
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
