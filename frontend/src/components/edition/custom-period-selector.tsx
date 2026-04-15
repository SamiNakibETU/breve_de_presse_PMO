"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { api } from "@/lib/api";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDatetimeLocal(d: Date): string {
  return `${toIso(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function CustomPeriodSelector({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const [windowStart, setWindowStart] = useState(toDatetimeLocal(twoDaysAgo));
  const [windowEnd, setWindowEnd] = useState(toDatetimeLocal(now));
  const [label, setLabel] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const ws = new Date(windowStart);
      const we = new Date(windowEnd);
      if (we <= ws) throw new Error("La fin doit être postérieure au début.");
      const edition = await api.createCustomEdition({
        publish_date: toIso(we),
        window_start: ws.toISOString(),
        window_end: we.toISOString(),
        label: label.trim() || undefined,
      });
      await api.runCustomEditionPipeline(edition.id, {
        run_analysis: true,
        run_topic_detection: true,
        analysis_force: true,
      });
      return edition;
    },
    onSuccess: (edition) => {
      setOpen(false);
      const d = edition.publish_date;
      router.push(`/edition/${d}`);
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      createMutation.mutate();
    },
    [createMutation],
  );

  if (!open) {
    return (
      <div className={`space-y-1 ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
        >
          <span className="text-[13px]" aria-hidden>
            +
          </span>
          Période personnalisée
        </button>
        <p className="max-w-lg text-[10px] leading-snug text-muted-foreground">
          Crée une édition sur des dates libres, lance l&apos;analyse puis ouvre automatiquement le{" "}
          <strong className="font-medium text-foreground-body">sommaire du jour de fin</strong> (URL{" "}
          <code className="rounded bg-muted/50 px-0.5 text-[9px]">/edition/AAAA-MM-JJ</code>
          ). Retrouvez-la comme n&apos;importe quelle édition via le calendrier ou le rail de dates.
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-lg rounded-2xl border border-border/60 bg-card p-5 shadow-low ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">
          Édition sur période personnalisée
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Annuler
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Début de la période</span>
            <input
              type="datetime-local"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground transition-colors focus:border-accent focus:outline-none"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Fin de la période</span>
            <input
              type="datetime-local"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground transition-colors focus:border-accent focus:outline-none"
              required
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Libellé (optionnel)
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex. : Édition spéciale semaine 14"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-accent focus:outline-none"
          />
        </label>

        {createMutation.isError && (
          <p className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-[11px] text-accent">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : "Erreur lors de la création."}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-accent px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending
              ? "Génération en cours..."
              : "Créer et analyser"}
          </button>
        </div>
      </form>
    </div>
  );
}
