/**
 * Normalise une ligne de puce d’analyse experte pour l’affichage (évite doublon avec la numérotation).
 */

const LEADING_BULLET_RE = /^[\s\u00A0]*(?:[-–—•·◦◇◆]|\d{1,2}\.\s*)+/u;

export function normalizeBulletLine(line: string): string {
  let s = line.replace(/\r\n/g, "\n").trim();
  if (!s) {
    return s;
  }
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(LEADING_BULLET_RE, "").trim();
  }
  return s;
}
