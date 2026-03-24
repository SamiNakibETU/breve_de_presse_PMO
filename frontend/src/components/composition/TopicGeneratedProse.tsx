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
 * Variante `compose` : hauteur libre, typographie confortable pour la page Rédaction.
 */
export function TopicGeneratedProse({
  text,
  variant = "card",
  showCopyButton = false,
}: {
  text: string;
  variant?: "card" | "compose";
  showCopyButton?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [trimmed]);

  const blocks = trimmed
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div
      className={cn(
        variant === "card" &&
          "mt-4 max-h-[min(28rem,70vh)] overflow-y-auto border border-border-light bg-white p-4 sm:p-5",
        variant === "compose" &&
          "mt-3 border border-border-light bg-card p-4 sm:p-6",
      )}
      role="region"
      aria-label="Texte généré pour ce sujet"
    >
      {showCopyButton ? (
        <div className="mb-3 flex justify-end border-b border-border-light pb-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="olj-btn-secondary px-3 py-1 text-[12px]"
          >
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          "font-[family-name:var(--font-serif)] text-[16px] leading-[1.8] text-foreground",
          variant === "compose" && "text-[16px] leading-[1.8]",
        )}
      >
        {blocks.map((block, i) => renderBlock(block, i))}
      </div>
    </div>
  );
}
