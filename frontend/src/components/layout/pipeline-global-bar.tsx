"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";

/** Bandeau discret : la pipeline continue même hors de la page d’accueil. */
export function PipelineGlobalBar() {
  const pathname = usePathname();
  const ctx = usePipelineRunnerOptional();
  const running = ctx?.running;

  if (!running) return null;

  const onHome = pathname === "/";

  return (
    <div className="border-b border-border-light bg-accent-tint/80">
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[12px] text-foreground sm:px-6">
        <span className="font-semibold text-accent">Opération en cours</span>
        <span className="text-foreground-subtle">{running.label}</span>
        {running.stepLabel ? (
          <span className="min-w-0 text-foreground-body">
            <span className="text-muted-foreground">·</span> {running.stepLabel}
          </span>
        ) : null}
        <span className="text-[11px] text-muted-foreground">
          (vous pouvez continuer à naviguer pendant ce temps)
        </span>
        {!onHome ? (
          <Link
            href="/"
            className="ml-auto shrink-0 underline decoration-border underline-offset-2 hover:text-accent"
          >
            Retour au sommaire du jour
          </Link>
        ) : null}
      </div>
    </div>
  );
}
