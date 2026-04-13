"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatLogTimestampFr } from "@/lib/dates-display-fr";

function isDedupStep(step: string): boolean {
  return step.includes("dedup") || step.toLowerCase().includes("semantic");
}

export default function RegieDedupPage() {
  const qc = useQueryClient();
  const [articleId, setArticleId] = useState("");
  const [note, setNote] = useState("");

  const pipelineQ = useQuery({
    queryKey: ["regie", "pipeline-debug-logs", "dedup"] as const,
    queryFn: () => api.regiePipelineDebugLogs({ limit: 120 }),
  });

  const feedbackQ = useQuery({
    queryKey: ["regie", "dedup-feedback"] as const,
    queryFn: () => api.regieDedupFeedbackList(40),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.regieDedupFeedbackCreate({
        article_id: articleId.trim(),
        note: note.trim(),
      }),
    onSuccess: () => {
      setArticleId("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["regie", "dedup-feedback"] });
    },
  });

  const dedupItems =
    pipelineQ.data?.items.filter((r) => isDedupStep(r.step)) ?? [];

  return (
    <div className="space-y-8 text-[13px] leading-relaxed text-foreground-body">
      <header className="space-y-2">
        <p className="olj-rubric">Régie · Production</p>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Déduplication
        </h1>
        <p className="max-w-3xl text-[13px] leading-relaxed text-foreground-body">
          Rapports d’étapes surface et sémantique (filtre sur les étapes dont le nom contient « dedup »).
          Signalement d’un cas douteux en bas de page.
        </p>
      </header>

      {pipelineQ.isPending && (
        <p className="text-muted-foreground" role="status">
          Chargement…
        </p>
      )}
      {pipelineQ.error && (
        <p className="olj-alert-destructive px-3 py-2" role="alert">
          {pipelineQ.error instanceof Error
            ? pipelineQ.error.message
            : "Erreur"}
        </p>
      )}
      {pipelineQ.data && (
        <div className="overflow-x-auto border border-border-light">
          <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-2 py-2 font-medium" title="Heure de Beyrouth (UTC+3 en été)">
                  Date (Beyrouth)
                </th>
                <th className="px-2 py-2 font-medium">Étape</th>
                <th className="px-2 py-2 font-medium">Édition</th>
              </tr>
            </thead>
            <tbody>
              {dedupItems.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-muted-foreground">
                    Aucune entrée dédup dans les derniers rapports.
                  </td>
                </tr>
              )}
              {dedupItems.map((r) => (
                <tr key={r.id} className="border-b border-border-light">
                  <td className="whitespace-nowrap px-2 py-2 text-[11px] text-muted-foreground tabular-nums">
                    {formatLogTimestampFr(r.created_at)}
                  </td>
                  <td className="px-2 py-2 font-medium">{r.step}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">
                    {r.edition_id ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-2" aria-labelledby="dedup-feedback">
        <h2 id="dedup-feedback" className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Signalement (faux positif)
        </h2>
        <form
          className="max-w-md space-y-3 border border-border-light p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!articleId.trim() || !note.trim()) return;
            submitMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="dedup-article-id" className="block text-[11px] font-medium text-foreground">
              ID article (UUID)
            </label>
            <input
              id="dedup-article-id"
              className="mt-1 w-full border border-border bg-background px-2 py-1.5 font-mono text-[12px]"
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="dedup-note" className="block text-[11px] font-medium text-foreground">
              Note
            </label>
            <textarea
              id="dedup-note"
              className="mt-1 min-h-[80px] w-full border border-border bg-background px-2 py-1.5 text-[12px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {submitMutation.isError && (
            <p className="olj-alert-destructive px-3 py-2 text-[12px]" role="alert">
              {submitMutation.error instanceof Error
                ? submitMutation.error.message
                : "Erreur"}
            </p>
          )}
          {submitMutation.isSuccess && (
            <p className="text-[12px] text-[color:var(--color-success)]" role="status">
              Enregistré.
            </p>
          )}
          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="olj-btn-primary text-[12px] disabled:opacity-40"
          >
            {submitMutation.isPending ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      </section>

      <section className="space-y-2" aria-labelledby="dedup-list">
        <h2 id="dedup-list" className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Derniers signalements
        </h2>
        {feedbackQ.isPending && <p role="status">Chargement…</p>}
        {feedbackQ.error && (
          <p className="olj-alert-destructive px-3 py-2" role="alert">
            {feedbackQ.error instanceof Error
              ? feedbackQ.error.message
              : "Erreur"}
          </p>
        )}
        {feedbackQ.data && feedbackQ.data.length === 0 && (
          <p className="text-muted-foreground">Aucun signalement.</p>
        )}
        {feedbackQ.data && feedbackQ.data.length > 0 && (
          <ul className="space-y-2 border border-border-light p-3 text-[12px]">
            {feedbackQ.data.map((f) => (
              <li key={f.id} className="border-b border-border-light pb-2 last:border-0">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatLogTimestampFr(f.created_at)}
                </span>{" "}
                <span className="font-mono">{f.article_id}</span>
                <p className="mt-1 text-foreground-body">{f.note}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
