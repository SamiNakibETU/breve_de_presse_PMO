"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Edition } from "@/lib/types";
import { ComposePreview } from "@/components/composition/ComposePreview";
import { CopyExportButtons } from "@/components/composition/CopyExportButtons";
import { CoverageGaps } from "@/components/composition/CoverageGaps";

export default function ComposePage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";
  const qc = useQueryClient();

  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
  });

  const editionId = editionQ.data?.id;

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId] as const,
    queryFn: () => api.editionTopics(editionId!),
    enabled: Boolean(editionId),
  });

  const genAllMutation = useMutation({
    mutationFn: () => api.editionGenerateAll(editionId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edition", date] });
      qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
    },
  });

  const edition = editionQ.data ?? null;
  const topics = topicsQ.data ?? [];

  const bodyFromTopics = topics
    .map((t) => t.generated_text?.trim())
    .filter(Boolean)
    .join("\n\n\n");

  const body =
    edition?.generated_text?.trim() ||
    bodyFromTopics ||
    topics
      .map(
        (t) =>
          `« ${t.title_final ?? t.title_proposed} »\n${t.dominant_angle ? `Résumé : ${t.dominant_angle}` : ""}`,
      )
      .join("\n\n")
      .trim();

  const gaps: string[] = [];

  return (
    <div className="space-y-8">
      <nav className="text-[13px] text-muted-foreground">
        <Link
          href={`/edition/${date}`}
          className="underline-offset-4 hover:underline"
        >
          ← Sommaire
        </Link>
      </nav>
      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold">
          Composition
        </h1>
        <p className="mt-1 text-[13px] text-foreground-muted">
          Texte prêt à copier pour le CMS (génération par sujet, format OLJ).
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="border border-foreground bg-foreground px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          disabled={!editionId || genAllMutation.isPending || topics.length === 0}
          onClick={() => genAllMutation.mutate()}
        >
          {genAllMutation.isPending
            ? "Génération de tous les sujets…"
            : "Générer tous les sujets"}
        </button>
        {genAllMutation.isError && (
          <span className="text-[12px] text-accent">
            {(genAllMutation.error as Error)?.message ?? "Échec"}
          </span>
        )}
        {genAllMutation.isSuccess && genAllMutation.data?.status === "partial" && (
          <span className="text-[12px] text-warning">
            Partiel : certains sujets ont échoué.
          </span>
        )}
      </div>
      <CoverageGaps countries={gaps} />
      <ComposePreview
        body={
          body ||
          "Aucun texte généré pour l’instant. Utilisez « Générer » sur chaque sujet ou le bouton ci-dessus."
        }
      />
      <CopyExportButtons
        text={body || ""}
        filename={`revue-${date}.txt`}
      />
    </div>
  );
}
