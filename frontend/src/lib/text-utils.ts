/**
 * Retire les guillemets français externes si le LLM les a déjà inclus dans la chaîne
 * (évite « « … » » à l’affichage).
 */
export function stripFrenchQuotes(s: string): string {
  let t = s.trim();
  if (t.startsWith("«")) {
    t = t.slice(1).trimStart();
  } else if (t.startsWith("\u00ab")) {
    t = t.slice(1).trimStart();
  }
  if (t.endsWith("»")) {
    t = t.slice(0, -1).trimEnd();
  } else if (t.endsWith("\u00bb")) {
    t = t.slice(0, -1).trimEnd();
  }
  return t;
}

/** Citation prête pour affichage : une seule couche de « ». */
export function formatQuoteForDisplay(raw: string): string {
  return stripFrenchQuotes(raw);
}

/**
 * Décode les entités HTML courantes (ex. &#8211; → tiret) pour l’affichage React.
 * Côté client uniquement ; SSR retourne la chaîne inchangée si pas de `document`.
 */
export function decodeHtmlEntities(s: string): string {
  if (typeof document === "undefined") {
    return s;
  }
  if (!s.includes("&")) {
    return s;
  }
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}
