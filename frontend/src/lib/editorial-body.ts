/** Découpage du corps traduit (paragraphes, sections ## / ---). */

export function bodyParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
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
