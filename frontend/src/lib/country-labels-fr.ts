/** Libellés FR pour codes pays ISO2 (alignés API / config couverture). */

export const COUNTRY_LABELS_FR: Record<string, string> = {
  LB: "Liban",
  IL: "Israël",
  IR: "Iran",
  AE: "EAU",
  SA: "Arabie saoudite",
  TR: "Turquie",
  IQ: "Irak",
  SY: "Syrie",
  QA: "Qatar",
  JO: "Jordanie",
  EG: "Égypte",
  KW: "Koweït",
  BH: "Bahreïn",
  OM: "Oman",
  DZ: "Algérie",
  ME: "Régional",
  US: "États-Unis",
  GB: "Royaume-Uni",
  FR: "France",
  YE: "Yémen",
  XX: "Inconnu",
};

export function countryLabelFr(code: string): string {
  const u = code.trim().toUpperCase();
  return COUNTRY_LABELS_FR[u] ?? u;
}
