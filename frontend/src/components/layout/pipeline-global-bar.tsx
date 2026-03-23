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
    <div className="border-b border-border-light bg-accent-tint/80">
      <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 text-[12px] text-foreground sm:px-6">
        <span className="font-semibold text-accent">Tâche en cours</span>
        <span className="text-foreground-subtle">{running.label}</span>
        {running.stepLabel ? (
          <span className="min-w-0 text-foreground-body">
            <span className="text-muted-foreground">·</span> {running.stepLabel}
          </span>
        ) : null}
        {!onSommaire ? (
          <Link
            href="/"
            className="ml-auto shrink-0 text-[11px] underline decoration-border underline-offset-2 hover:text-accent"
          >
            Sommaire du jour
          </Link>
        ) : null}
      </div>
    </div>
  );
}
