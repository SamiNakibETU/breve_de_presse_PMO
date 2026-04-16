"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parseArticleIdsParam } from "@/lib/review-url";
import type { Article } from "@/lib/types";

function orderArticlesByIds(articles: Article[], ids: readonly string[]): Article[] {
  const byId = new Map(articles.map((a) => [a.id, a]));
  return ids.map((id) => byId.get(id)).filter((a): a is Article => Boolean(a));
}

export function ReviewPageClient() {
  const searchParams = useSearchParams();
  const ids = useMemo(() => parseArticleIdsParam(searchParams.get("ids")), [searchParams]);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [generatedReviewId, setGeneratedReviewId] = useState<string | null>(null);

  const articlesQ = useQuery({
    queryKey: ["reviewArticlesByIds", ids.join(",")] as const,
    queryFn: () => api.articlesByIds([...ids]),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  const articlesOrdered = useMemo(
    () => orderArticlesByIds(articlesQ.data?.articles ?? [], ids),
    [articlesQ.data?.articles, ids],
  );

  const generateMutation = useMutation({
    mutationFn: () => api.generateReview([...ids]),
    onSuccess: (res) => {
      setGeneratedText(res.full_text);
      setGeneratedReviewId(res.review_id);
    },
  });

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-5 py-12">
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground sm:text-[24px]">
          Revue sur sélection
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Aucun article dans l&apos;URL. Sélectionnez des textes sur la page{" "}
          <Link href="/articles" className="olj-link-action font-medium">
            Articles
          </Link>
          , puis utilisez « Générer la revue » : les identifiants sont passés en paramètre{" "}
          <code className="rounded bg-muted/60 px-1 text-[11px]">ids</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-10 pb-24">
      <header className="space-y-2 border-b border-border pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Composition</p>
        <h1 className="font-[family-name:var(--font-serif)] text-[24px] font-semibold leading-tight text-foreground sm:text-[28px]">
          Générer une revue
        </h1>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {ids.length} article{ids.length > 1 ? "s" : ""} · texte produit à partir du corpus sélectionné (limite 10 côté
          interface).
        </p>
      </header>

      {articlesQ.isError ? (
        <p className="olj-alert-destructive text-[13px]">
          Impossible de charger les articles. Vérifiez les identifiants ou réessayez.
        </p>
      ) : articlesQ.isPending ? (
        <p className="text-[13px] text-muted-foreground">Chargement des articles…</p>
      ) : (
        <ul className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-4 sm:p-5">
          {articlesOrdered.map((a) => (
            <li key={a.id} className="text-[13px] leading-snug text-foreground">
              <span className="font-medium">{a.country}</span>
              <span className="text-muted-foreground"> · </span>
              <span>{a.media_name}</span>
              <span className="text-muted-foreground"> — </span>
              <span className="italic">{a.title_fr?.trim() || a.title_original}</span>
            </li>
          ))}
        </ul>
      )}

      {generateMutation.isError ? (
        <p className="olj-alert-destructive text-[13px]">
          La génération a échoué. Vérifiez la connexion et les droits côté serveur.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="olj-btn-primary px-5 py-2.5 text-[13px] disabled:opacity-45"
          disabled={
            generateMutation.isPending || articlesQ.isPending || articlesOrdered.length === 0
          }
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending ? "Génération en cours…" : "Lancer la génération"}
        </button>
        <Link href="/articles" className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-accent">
          Retour aux articles
        </Link>
      </div>

      {generatedText != null ? (
        <section className="space-y-3 border-t border-border pt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Texte généré</h2>
          {generatedReviewId ? (
            <p className="text-[11px] text-muted-foreground">
              Revue enregistrée · identifiant{" "}
              <code className="rounded bg-muted/60 px-1">{generatedReviewId}</code>
            </p>
          ) : null}
          <div className="rounded-xl border border-border/50 bg-background p-4 sm:p-6">
            <div className="font-[family-name:var(--font-serif)] whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {generatedText}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
