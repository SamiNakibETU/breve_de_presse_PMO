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

function FlagIcon({ code }: { code: string }) {
  const upper = code.trim().toUpperCase();
  if (!upper || upper.length !== 2) return null;
  const cp1 = upper.codePointAt(0)! - 65 + 0x1f1e6;
  const cp2 = upper.codePointAt(1)! - 65 + 0x1f1e6;
  return <span aria-hidden>{String.fromCodePoint(cp1)}{String.fromCodePoint(cp2)}</span>;
}

function ArticleRow({ a }: { a: Article }) {
  return (
    <li className="border-b border-border/30 pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
        <span className="font-medium text-foreground">
          <FlagIcon code={a.country_code} />{" "}{a.country}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-foreground-body">{a.media_name}</span>
        {a.article_type ? (
          <span className="rounded bg-muted/60 px-1 text-[10px] text-muted-foreground">{a.article_type}</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">
        {a.title_fr?.trim() || a.title_original}
      </p>
      {a.thesis_summary_fr ? (
        <p className="mt-1 text-[11px] italic leading-snug text-muted-foreground line-clamp-2">
          {a.thesis_summary_fr}
        </p>
      ) : a.editorial_angle ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
          {a.editorial_angle}
        </p>
      ) : null}
    </li>
  );
}

export function ReviewPageClient() {
  const searchParams = useSearchParams();
  const ids = useMemo(() => parseArticleIdsParam(searchParams.get("ids")), [searchParams]);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    },
  });

  async function handleCopy() {
    if (!generatedText) return;
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-5 py-12">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Composition</p>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Revue sur sélection
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Aucun article sélectionné. Sélectionnez des textes sur{" "}
          <Link href="/articles" className="olj-link-action font-medium">Articles</Link>
          {" "}puis cliquez « Générer la revue ».
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 pb-24">
      <header className="border-b border-border pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Composition</p>
        <h1 className="mt-1 font-[family-name:var(--font-serif)] text-[24px] font-semibold leading-tight text-foreground sm:text-[27px]">
          Revue de presse
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {ids.length} article{ids.length > 1 ? "s" : ""} sélectionné{ids.length > 1 ? "s" : ""}
        </p>
      </header>

      <div className="mt-6 space-y-6">
        {/* Corpus */}
        {articlesQ.isError ? (
          <p className="olj-alert-destructive text-[12px]">
            Impossible de charger les articles.
          </p>
        ) : articlesQ.isPending ? (
          <p className="text-[12px] text-muted-foreground">Chargement…</p>
        ) : (
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Corpus ({articlesOrdered.length})
            </h2>
            <ul className="space-y-3 rounded-xl border border-border/55 bg-muted/10 p-4 sm:p-5">
              {articlesOrdered.map((a) => (
                <ArticleRow key={a.id} a={a} />
              ))}
            </ul>
          </section>
        )}

        {/* Génération */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-5">
          <button
            type="button"
            className="olj-btn-primary px-5 py-2.5 text-[13px] disabled:opacity-45"
            disabled={generateMutation.isPending || articlesQ.isPending || articlesOrdered.length === 0}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending
              ? "Génération en cours…"
              : generatedText
                ? "Regénérer"
                : "Générer la revue"}
          </button>
          <Link
            href="/articles"
            className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-accent"
          >
            ← Articles
          </Link>
        </div>

        {generateMutation.isError ? (
          <p className="olj-alert-destructive text-[12px]">
            La génération a échoué. Vérifiez la connexion au serveur.
          </p>
        ) : null}

        {/* Résultat */}
        {generatedText != null ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Texte généré
              </h2>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:text-foreground"
              >
                {copied ? "Copié ✓" : "Copier"}
              </button>
            </div>
            <div className="rounded-xl border border-border/50 bg-background p-4 sm:p-6">
              <div className="font-[family-name:var(--font-serif)] whitespace-pre-wrap text-[15px] leading-[1.7] text-foreground">
                {generatedText}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
