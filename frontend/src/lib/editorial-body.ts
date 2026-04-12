/** Découpage du corps traduit (paragraphes, sections ## / ---). */

const _NOISE_LINE_RES: readonly RegExp[] = [
  /^\s*0\s+commentaires?\s*$/i,
  /^\s*aucun\s+commentaire\s*$/i,
  /^\s*\d+\s+commentaires?\s*$/i,
];

/** Sépare une phrase collée à une date type « … fin.6 avril 2026 » (affichage uniquement). */
const _DATE_AFTER_DOT_RE =
  /\.(\s*)(?=\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b)/gi;

/**
 * Nettoie le corps traduit avant paragraphes : bruit de commentaires, dates collées au point précédent.
 * N’altère pas la base — usage lecture / fiche article uniquement.
 * Règles alignées sur ``backend/src/services/content_display_sanitize.py`` (extraction hub).
 */
export function sanitizeTranslatedBodyForDisplay(raw: string): string {
  const t0 = raw.replace(/\r\n/g, "\n").trim();
  if (!t0) {
    return raw;
  }
  const lines = t0.split("\n");
  const kept = lines.filter((line) => {
    const s = line.trim();
    if (!s) {
      return true;
    }
    return !_NOISE_LINE_RES.some((re) => re.test(s));
  });
  let t = kept.join("\n");
  t = t.replace(_DATE_AFTER_DOT_RE, ".\n\n$1");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * Découpe un texte en paragraphes pour affichage.
 * Gère les cas où le texte brut n'a pas de sauts de ligne doubles :
 * - coupe sur \n\n (cas standard)
 * - si un seul bloc > 600 chars, coupe aux phrases (. suivi d'espace + majuscule)
 */
export function bodyParagraphs(text: string): string[] {
  const raw = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
  if (raw.length > 1) return raw;
  if (raw.length === 0) return [];
  const single = raw[0];
  if (single.length <= 600) return [single];

  const chunks: string[] = [];
  let buf = "";
  const sentences = single.split(/(?<=\.)\s+(?=[A-ZÀ-ÖØ-Ý«""])/);
  for (const s of sentences) {
    if (buf.length + s.length > 500 && buf.length > 80) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf += (buf ? " " : "") + s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length > 0 ? chunks : [single];
}

export function editorialBodySections(
  text: string,
): { heading?: string; paragraphs: string[] }[] {
  const paras = bodyParagraphs(text);
  const blocks: { heading?: string; paragraphs: string[] }[] = [];
  let cur: { heading?: string; paragraphs: string[] } = { paragraphs: [] };
  for (const p of paras) {
    if (p.startsWith("## ")) {
      if (cur.paragraphs.length > 0 || cur.heading) {
        blocks.push(cur);
        cur = { paragraphs: [] };
      }
      cur.heading = p.slice(3).trim();
      continue;
    }
    if (p === "---") {
      if (cur.paragraphs.length > 0 || cur.heading) {
        blocks.push(cur);
        cur = { paragraphs: [] };
      }
      continue;
    }
    cur.paragraphs.push(p);
  }
  if (cur.paragraphs.length > 0 || cur.heading) {
    blocks.push(cur);
  }
  return blocks.length > 0 ? blocks : [{ paragraphs: paras }];
}
