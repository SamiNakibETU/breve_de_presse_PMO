/** Drapeaux emoji par code pays ISO2 (affichage UI). */

export const REGION_FLAG_EMOJI: Record<string, string> = {
  LB: "🇱🇧",
  IL: "🇮🇱",
  IR: "🇮🇷",
  SA: "🇸🇦",
  AE: "🇦🇪",
  TR: "🇹🇷",
  IQ: "🇮🇶",
  SY: "🇸🇾",
  QA: "🇶🇦",
  JO: "🇯🇴",
  KW: "🇰🇼",
  BH: "🇧🇭",
  OM: "🇴🇲",
  EG: "🇪🇬",
  US: "🇺🇸",
  GB: "🇬🇧",
  FR: "🇫🇷",
  DZ: "🇩🇿",
  YE: "🇾🇪",
};

export function regionFlagEmoji(code: string): string {
  const u = code.trim().toUpperCase();
  return REGION_FLAG_EMOJI[u] ?? u;
}
