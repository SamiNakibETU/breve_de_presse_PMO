"use client";

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

/**
 * Rendu du texte généré en prose éditoriale (serif), sans &lt;pre&gt; monospace.
 * Si un bloc est une liste de puces homogène, conversion en &lt;ul&gt; sobre.
 */
export function TopicGeneratedProse({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const blocks = trimmed
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div
      className="mt-4 max-h-[min(28rem,70vh)] overflow-y-auto border border-border-light bg-white p-4 sm:p-5"
      role="region"
      aria-label="Texte généré pour ce sujet"
    >
      <div className="font-[family-name:var(--font-serif)] text-[15px] leading-[1.75] text-foreground">
        {blocks.map((block, i) => {
          const lines = block
            .split("\n")
            .map((l) => l.trimEnd())
            .filter((l) => l.trim().length > 0);
          const allBullets =
            lines.length >= 2 && lines.every((l) => isBulletLine(l));

          if (allBullets) {
            return (
              <ul
                key={i}
                className="mb-4 list-disc space-y-2 pl-5 text-foreground last:mb-0 marker:text-muted-foreground"
              >
                {lines.map((line, j) => (
                  <li key={j} className="pl-0.5">
                    {stripBulletPrefix(line)}
                  </li>
                ))}
              </ul>
            );
          }

          return (
            <p key={i} className="mb-4 whitespace-pre-wrap last:mb-0">
              {block}
            </p>
          );
        })}
      </div>
    </div>
  );
}
