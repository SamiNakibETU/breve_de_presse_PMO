"use client";

import { useCallback, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function stripBulletPrefix(line: string): string {
  const t = line.trim();
  return t
    .replace(/^[-•*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function isBulletLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return /^[-•*]\s+/.test(t) || /^\d+\.\s+/.test(t);
}

function renderBlock(block: string, i: number): ReactNode {
  const rawLines = block
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return null;

  const hMatch = rawLines[0].match(/^#{1,6}\s+(.*)$/);
  if (hMatch) {
    const rest = rawLines.slice(1);
    return (
      <div key={i} className="mb-5 last:mb-0">
        <h2 className="mb-3 font-[family-name:var(--font-serif)] text-[17px] font-semibold leading-snug text-foreground">
          {hMatch[1].trim()}
        </h2>
        {rest.length > 0 ? (
          <div className="space-y-3">
            {rest.map((line, j) => (
              <p key={j} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const allBullets =
    rawLines.length >= 2 && rawLines.every((l) => isBulletLine(l));

  if (allBullets) {
    return (
      <ul
        key={i}
        className="mb-5 list-disc space-y-2 pl-5 text-foreground last:mb-0 marker:text-muted-foreground"
      >
        {rawLines.map((line, j) => (
          <li key={j} className="pl-0.5">
            {stripBulletPrefix(line)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p key={i} className="mb-5 whitespace-pre-wrap last:mb-0">
      {block}
    </p>
  );
}

/**
 * Rendu du texte généré en prose éditoriale (serif).
 * - `card` : zone limitée en hauteur (aperçus compacts).
 * - `compose` / `fiche` : pas de max-height (évite double ascenseur sur la page).
 */
export function TopicGeneratedProse({
  text,
  variant = "card",
  showCopyButton = false,
}: {
  text: string;
  variant?: "card" | "compose" | "fiche";
  showCopyButton?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = text.trim();

  const copy = useCallback(async () => {
    const payload = text.trim();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  if (!trimmed) return null;

  const blocks = trimmed
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const isFullBleed = variant === "compose" || variant === "fiche";

  return (
    <div
      className={cn(
        variant === "card" &&
          "mt-4 max-h-[min(28rem,70vh)] overflow-y-auto border border-border-light bg-white p-4 sm:p-5",
        variant === "fiche" &&
          "mt-4 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6",
        variant === "compose" &&
          "mt-0 border-0 bg-transparent p-0 shadow-none",
      )}
      role="region"
      aria-label="Texte généré pour ce sujet"
    >
      {showCopyButton ? (
        <div
          className={cn(
            "mb-4 flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between",
            variant === "fiche" && "border-accent/20",
          )}
        >
          <p className="text-[12px] leading-snug text-muted-foreground sm:max-w-md">
            {variant === "fiche"
              ? "Texte prêt pour la revue — copiez-le dans votre CMS."
              : "Copiez le bloc pour le coller ailleurs."}
          </p>
          <button
            type="button"
            onClick={() => void copy()}
            className={cn(
              "shrink-0 px-4 py-2 text-[13px] font-semibold",
              variant === "fiche" || variant === "compose"
                ? "olj-btn-primary"
                : "olj-btn-secondary px-3 py-1 text-[12px]",
            )}
          >
            {copied ? "Copié dans le presse-papiers" : "Copier tout le texte"}
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          "font-[family-name:var(--font-serif)] text-[16px] leading-[1.8] text-foreground",
        isFullBleed && "text-[16px] leading-[1.8]",
        )}
      >
        {blocks.map((block, i) => renderBlock(block, i))}
      </div>
    </div>
  );
}
