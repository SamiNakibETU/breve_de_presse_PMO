"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";

/** Identifiant prompt chargé depuis curator_v2.yaml (bundle.prompt_id). */
const CURATOR_PROMPT_ID = "prompt_curator_v2";

export default function RegieCuratorPage() {
  const q = useQuery({
    queryKey: ["regie", "llm-call-logs", "curator"] as const,
    queryFn: () =>
      api.regieLlmCallLogs({
        prompt_id: CURATOR_PROMPT_ID,
        limit: 20,
        include_raw: false,
      }),
  });

  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-foreground-body">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-foreground">
        Curateur
      </h1>
      <p>
        Appels LLM du curateur (« {CURATOR_PROMPT_ID} »). Liste complète :{" "}
        <Link href="/regie/logs" className="underline-offset-4 hover:underline">
          Logs LLM
        </Link>
        .
      </p>

      {q.isPending && (
        <p className="text-muted-foreground" role="status">
          Chargement…
        </p>
      )}
      {q.error && (
        <p className="text-destructive" role="alert">
          {q.error instanceof Error ? q.error.message : "Erreur de chargement"}
        </p>
      )}
      {q.data && q.data.items.length === 0 && (
        <p className="text-muted-foreground">
          Aucun appel curateur enregistré. Lancez une curation depuis l’édition
          (POST curate) ou attendez un run pipeline.
        </p>
      )}
      {q.data && q.data.items.length > 0 && (
        <ul className="space-y-4">
          {q.data.items.map((r) => (
            <li
              key={r.id}
              className="border border-border-light bg-card p-4"
            >
              <p className="font-mono text-[11px] text-muted-foreground">
                {r.created_at} — {r.model_used} — jetons {r.input_tokens ?? "—"}/
                {r.output_tokens ?? "—"}
                {r.has_validation_error ? (
                  <span className="text-destructive"> — erreur validation</span>
                ) : null}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] font-medium text-foreground">
                  Aperçu sortie
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words border border-border-light bg-muted/30 p-3 font-mono text-[11px]">
                  {r.output_raw_preview ?? "—"}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
