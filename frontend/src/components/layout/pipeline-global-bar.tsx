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
    <div className="border-b border-[#c8102e]/25 bg-[#faf7f6]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-[12px] text-[#1a1a1a]">
        <span className="font-semibold text-[#c8102e]">Pipeline en cours</span>
        <span className="text-[#444]">{running.label}</span>
        {running.stepLabel ? (
          <span className="min-w-0 text-[#555]">
            <span className="text-[#888]">·</span> {running.stepLabel}
          </span>
        ) : null}
        <span className="text-[11px] text-[#888]">
          (le traitement serveur continue si vous changez de page)
        </span>
        {!onHome ? (
          <Link
            href="/"
            className="ml-auto shrink-0 underline decoration-[#ccc] underline-offset-2 hover:text-[#c8102e]"
          >
            Voir le tableau
          </Link>
        ) : null}
      </div>
    </div>
  );
}
