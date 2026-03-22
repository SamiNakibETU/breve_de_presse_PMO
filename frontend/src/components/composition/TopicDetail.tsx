"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Article, EditionTopic, TopicArticleRef } from "@/lib/types";
import { ArticleRow } from "./ArticleRow";

export function TopicDetail({
  editionId,
  publishDate,
  topic,
  articles,
  articleRefs,
  articleIdsOrder,
}: {
  editionId: string;
  publishDate: string;
  topic: EditionTopic;
  articles: Article[];
  articleRefs: TopicArticleRef[];
  articleIdsOrder: string[];
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
      qc.invalidateQueries({ queryKey: ["editionTopicDetail", editionId, topic.id] });
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
      qc.invalidateQueries({ queryKey: ["editionTopicDetail", editionId, topic.id] });
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
    <article className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-[24px] font-semibold leading-tight">
          {topic.title_final ?? topic.title_proposed}
        </h1>
        {topic.counter_angle && (
          <p className="mt-3 text-[13px] text-foreground-body">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Contrepoint
            </span>
            <br />
            {topic.counter_angle}
          </p>
        )}
      </header>
      <section>
        <h2 className="mb-2 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Articles
        </h2>
        <p className="mb-3 text-[12px] text-foreground-muted">
          Cochez les textes à inclure dans le bloc généré pour ce sujet.
        </p>
        <div>
          {orderedArticles.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              selected={selected.has(a.id)}
              onSelectedChange={(v) => toggle(a.id, v)}
            />
          ))}
        </div>
        {saveMutation.isError && (
          <p className="mt-2 text-[12px] text-accent">
            Enregistrement de la sélection impossible.
          </p>
        )}
      </section>
      <section className="border-t border-border-light pt-4">
        <button
          type="button"
          className="border border-primary bg-primary px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary-hover"
          disabled={genMutation.isPending || orderedArticles.length < 2}
          onClick={() => genMutation.mutate()}
        >
          {genMutation.isPending ? "Génération…" : "Générer le texte du sujet"}
        </button>
        {orderedArticles.length < 2 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Au moins deux articles sont requis.
          </p>
        )}
        {genMutation.isError && (
          <p className="mt-2 text-[12px] text-accent">
            {(genMutation.error as Error)?.message ?? "Échec de la génération."}
          </p>
        )}
        {genMutation.isSuccess && genMutation.data?.status === "ok" && (
          <p className="mt-2 text-[12px] text-success">
            Bloc généré. Retrouvez-le sous Composition ou ci-dessous.
          </p>
        )}
        {topic.generated_text && (
          <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap border border-border-light bg-muted p-4 text-[13px] leading-relaxed text-foreground">
            {topic.generated_text}
          </pre>
        )}
      </section>
    </article>
  );
}
