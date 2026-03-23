"use client";

import { cn } from "@/lib/utils";

export type EditionViewTabId = "sujets" | "themes" | "corpus";

const TABS: { id: EditionViewTabId; label: string }[] = [
  { id: "sujets", label: "Sujets du jour" },
  { id: "themes", label: "Thèmes" },
  { id: "corpus", label: "Corpus" },
];

export function EditionViewTabs({
  active,
  onChange,
}: {
  active: EditionViewTabId;
  onChange: (tab: EditionViewTabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Vues de l’édition"
      className="flex flex-wrap gap-1 border-b border-border"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            active === t.id
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
