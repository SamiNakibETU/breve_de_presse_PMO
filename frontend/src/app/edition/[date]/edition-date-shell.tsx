"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { EditionSelectionStickyBar } from "@/components/edition/edition-selection-sticky-bar";

/**
 * Enveloppe client : marge basse pour la barre sticky + barre partagée (sommaire, sujet, rédaction).
 */
export function EditionDateShell({ children }: { children: ReactNode }) {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";

  return (
    <div className="pb-36">
      {children}
      <EditionSelectionStickyBar editionDate={date} />
    </div>
  );
}
