"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";

/** Bandeau discret : suivi de la tâche pipeline hors page dédiée. */
export function PipelineGlobalBar() {
  const pathname = usePathname();
  const ctx = usePipelineRunnerOptional();
  const running = ctx?.running;

  if (!running) return null;

  const onSommaire =
    pathname === "/" || pathname.startsWith("/edition");

  return (
    <div className="border-b border-border-light bg-accent-tint/90">
      <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 text-foreground sm:px-6">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
          Traitement en cours
        </span>
        <span className="text-[13px] font-semibold text-foreground">
          {running.label}
        </span>
        {running.stepLabel ? (
          <span className="min-w-0 max-w-[min(100%,36rem)] text-[13px] font-medium leading-snug text-foreground-body">
            <span className="text-muted-foreground">Étape · </span>
            {running.stepLabel}
          </span>
        ) : null}
        {!onSommaire ? (
          <Link
            href="/"
            className="ml-auto shrink-0 text-[12px] font-medium underline decoration-border underline-offset-2 hover:text-accent"
          >
            Sujets du jour
          </Link>
        ) : null}
      </div>
    </div>
  );
}
